/**
 * Daily fleet expiry scan: the ONLY code that sends the staff
 * "Fleet MOT & PCO Expiry Summary" email (plus the licence / rent-due digests and driver notices).
 *
 * Callers:
 *  - POST /api/public/expiry-alerts  (GitHub Actions / pg_cron, X-Cron-Secret)  trigger = "cron"
 *  - POST /api/jobs/watchdog          (fallback if today's run is missing)        trigger = "watchdog"
 *  - runExpiryScanNow server fn       ("Run Expiry Scan Now" button in Settings)  trigger = "manual"
 *
 * Every run writes a job_runs row (job_name, status, counts, error_message) and every
 * email goes through sendEmailDirect, which writes email_log.
 */
import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { calculateNextPaymentDueDate } from "@/lib/fleet-data";
import { vehicleArtworkPath } from "@/lib/vehicle-display";
import { CRM_BASE_URL, DRIVER_PORTAL_URL } from "@/lib/domain-config";
import {
  renderDriverAlertTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  renderRentDueTomorrowTemplate,
} from "@/lib/email-templates";
import {
  sendEmailDirect,
  type SendEmailOptions,
  type SendEmailResult,
} from "@/lib/email-sender.server";

export const STAFF_ALERT_RECIPIENTS = "admin@fa-ibi.co.uk";
export const EXPIRY_JOB_NAME = "expiry-alerts";

export type ExpiryScanTrigger = "cron" | "manual" | "watchdog";

export interface ExpiryScanResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  jobRunId?: string | null;
  trigger: ExpiryScanTrigger;
  sent: number;
  failed: number;
  skippedEmails: number;
  /** Back-compat alias of skippedEmails used by the Job Execution Log UI. */
  skippedCount?: number;
  fleetExpiries: number;
  licenceExpiries: number;
  rentDueItems: number;
  fleetSummaryStatus: "sent" | "failed" | "skipped" | "not_needed";
  resendIds: string[];
  errors: string[];
}

function getStartOfDayUTC(d: Date | string | number): number {
  const date = new Date(d);
  if (isNaN(date.getTime())) return NaN;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function getDaysDiff(targetDateStr: string | Date, nowMs: number): number {
  const targetMidnight = getStartOfDayUTC(targetDateStr);
  const nowMidnight = getStartOfDayUTC(nowMs);
  if (isNaN(targetMidnight) || isNaN(nowMidnight)) return NaN;
  return Math.round((targetMidnight - nowMidnight) / 86400000);
}

function getLondonTodayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // YYYY-MM-DD in Europe/London
}

/** UTC instant of 00:00 Europe/London today (correct across BST/GMT). */
export function londonMidnightUtcISO(now: Date = new Date()): string {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Offset of London from UTC at that moment (0 in GMT, 60 in BST)
  const londonHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(utcMidnight)),
  );
  const offsetHours = londonHour === 0 ? 0 : londonHour;
  return new Date(utcMidnight - offsetHours * 3600 * 1000).toISOString();
}

async function findSuccessfulRunToday(supabaseAdmin: any): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("job_runs")
      .select("id, started_at")
      .eq("job_name", EXPIRY_JOB_NAME)
      .eq("status", "success")
      .gte("started_at", londonMidnightUtcISO())
      .order("started_at", { ascending: false })
      .limit(1);
    return data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function finishJobRun(
  supabaseAdmin: any,
  jobRunId: string | null,
  status: "success" | "failed",
  counts: Record<string, unknown>,
  errorMessage: string | null,
) {
  if (!jobRunId) return;
  try {
    const { error } = await supabaseAdmin
      .from("job_runs")
      .update({
        status,
        completed_at: new Date().toISOString(),
        counts,
        error_message: errorMessage,
      })
      .eq("id", jobRunId);
    if (error) console.warn("[ExpiryScan] job_runs update rejected:", error.message);
  } catch (err) {
    console.warn("[ExpiryScan] Could not update job_runs:", err);
  }
}

export async function runExpiryScan(
  opts: { trigger?: ExpiryScanTrigger; force?: boolean } = {},
): Promise<ExpiryScanResult> {
  const trigger: ExpiryScanTrigger = opts.trigger ?? "cron";
  // Generated DB types are out of date for job_runs/email_log; query untyped.
  const supabaseAdmin: any = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

  const empty: ExpiryScanResult = {
    ok: true,
    trigger,
    sent: 0,
    failed: 0,
    skippedEmails: 0,
    fleetExpiries: 0,
    licenceExpiries: 0,
    rentDueItems: 0,
    fleetSummaryStatus: "not_needed",
    resendIds: [],
    errors: [],
  };

  // Idempotency: scheduled callers (GitHub Actions fires 08:00 and 09:00 UTC, the watchdog, pg_cron)
  // may overlap. Only the first successful run of the London day sends; "manual" always runs.
  if (!opts.force && trigger !== "manual") {
    const existing = await findSuccessfulRunToday(supabaseAdmin);
    if (existing) {
      return { ...empty, skipped: true, reason: "already_ran_today", jobRunId: existing };
    }
  }

  let jobRunId: string | null = null;
  try {
    const { data: runData, error: runErr } = await supabaseAdmin
      .from("job_runs")
      .insert({
        job_name: EXPIRY_JOB_NAME,
        status: "running",
        started_at: new Date().toISOString(),
        counts: { trigger },
      })
      .select("id")
      .single();
    if (runErr) console.warn("[ExpiryScan] job_runs insert rejected:", runErr.message);
    if (runData) jobRunId = (runData as any).id;
  } catch (err) {
    console.warn("[ExpiryScan] Could not insert job_runs start row:", err);
  }

  const now = Date.now();
  const londonTodayStr = getLondonTodayISO();
  let totalSent = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let fleetSummaryStatus: ExpiryScanResult["fleetSummaryStatus"] = "not_needed";
  const resendIds: string[] = [];
  const failures: string[] = [];

  const send = async (options: SendEmailOptions): Promise<SendEmailResult> => {
    const res = await sendEmailDirect(options);
    if (res.status === "failed") {
      totalFailed++;
      failures.push(
        `${options.emailType || "email"} to ${options.recipient || options.to}: ${res.error}`,
      );
    }
    return res;
  };

  try {
    const [vRes, dRes] = await Promise.all([
      supabaseAdmin.from("vehicles").select("*"),
      supabaseAdmin.from("driver_tracks").select("*").neq("active", false).is("deleted_at", null),
    ]);

    if (vRes.error) {
      throw new Error(`Could not load vehicles: ${vRes.error.message}`);
    }
    if (dRes.error) {
      console.warn(
        "[ExpiryScan] Could not load drivers (continuing with vehicles only):",
        dRes.error.message,
      );
    }

    const vehicles: any[] = vRes.data ?? [];
    const rawDrivers: any[] = dRes.data ?? [];
    // Exclude inactive drivers
    const drivers = rawDrivers.filter((d) => d.status !== "inactive" && d.active !== false);

    // ---------------------------------------------------------------------------
    // 1. Staff-Facing Fleet-Wide MOT & PCO Summary + Driver Single-Vehicle Notices
    // ---------------------------------------------------------------------------
    type FleetItem = {
      registration: string;
      model: string;
      photoUrl?: string;
      motExpiry?: string;
      motDaysRemaining?: number;
      pcoExpiry?: string;
      pcoDaysRemaining?: number;
      detailsUrl?: string;
    };

    const fleetSummaryItems: FleetItem[] = [];

    for (const v of vehicles) {
      try {
        const motDate = getNextMotDate(v);
        const pcoDate = getPcoExpiryDate(v);

        let motDays: number | undefined = undefined;
        let pcoDays: number | undefined = undefined;

        if (motDate) {
          const d = getDaysDiff(motDate, now);
          if (!isNaN(d)) motDays = d;
        }

        if (pcoDate) {
          const d = getDaysDiff(pcoDate, now);
          if (!isNaN(d)) pcoDays = d;
        }

        const motExpiring = motDays !== undefined && motDays <= 30;
        const pcoExpiring = pcoDays !== undefined && pcoDays <= 30;

        if (motExpiring || pcoExpiring) {
          const artwork = vehicleArtworkPath(v);
          const photoUrl = artwork ? `${CRM_BASE_URL}${artwork}` : undefined;

          fleetSummaryItems.push({
            registration: v.reg,
            model: `${v.make} ${v.model}`,
            photoUrl,
            motExpiry: motExpiring ? motDate! : undefined,
            motDaysRemaining: motExpiring ? motDays : undefined,
            pcoExpiry: pcoExpiring ? pcoDate! : undefined,
            pcoDaysRemaining: pcoExpiring ? pcoDays : undefined,
            detailsUrl: `${CRM_BASE_URL}/vehicles/${v.reg}`,
          });

          const assignedDriver = drivers.find((d) => d.vehicle_id === v.id || d.reg === v.reg);

          if (assignedDriver) {
            const cards: any[] = [];
            if (motExpiring && motDate) {
              cards.push({
                iconType: "mot",
                title: "MOT Inspection Due",
                dateStr: motDate,
                vehicleReg: v.reg,
                vehicleModel: `${v.make} ${v.model}`,
                daysRemaining: motDays,
              });
            }
            if (pcoExpiring && pcoDate) {
              cards.push({
                iconType: "pco",
                title: "PCO Licence Renewal Due",
                dateStr: pcoDate,
                vehicleReg: v.reg,
                vehicleModel: `${v.make} ${v.model}`,
                daysRemaining: pcoDays,
              });
            }

            const driverEmail = assignedDriver.email?.trim() || null;
            const templateData = {
              recipientName: assignedDriver.driver_name,
              headline: `Vehicle Expiry Notice — ${v.reg}`,
              subtext: "Please review the details below and schedule an inspection.",
              cards,
              actionUrl: DRIVER_PORTAL_URL,
              actionText: "View Details in Portal",
            };
            const html = renderDriverAlertTemplate(templateData);

            const driverRes = await send({
              recipient: driverEmail || "none",
              skip: !driverEmail,
              skipReason: `Driver ${assignedDriver.driver_name} has no email on file`,
              subject: `Important Notice: Upcoming Vehicle Expiry for ${v.reg}`,
              emailType: "driver_alert",
              html,
              metadata: { vehicle_reg: v.reg, driver_id: assignedDriver.id },
            });

            if (driverRes.status === "sent") {
              totalSent++;
              if (driverRes.id) resendIds.push(driverRes.id);
            } else if (driverRes.status === "skipped") {
              totalSkipped++;
            }
          }
        }
      } catch (err: any) {
        console.error(`[ExpiryScan] Error processing vehicle ${v.reg}:`, err);
      }
    }

    // Send Fleet Summary digest to staff if vehicles have upcoming expiries
    if (fleetSummaryItems.length > 0) {
      try {
        const templateData = {
          headerLabel: "FLEET COMPLIANCE",
          headline: `Multiple vehicles have upcoming MOT & PCO expiries (${fleetSummaryItems.length})`,
          subtext: "Ensure your fleet remains road-legal, compliant, and ready for work.",
          vehicles: fleetSummaryItems,
          manageUrl: `${CRM_BASE_URL}/`,
        };
        const html = renderFleetSummaryTemplate(templateData);

        const staffFleetRes = await send({
          recipient: STAFF_ALERT_RECIPIENTS,
          subject: `Fleet MOT & PCO Expiry Summary — ${fleetSummaryItems.length} vehicle(s)`,
          emailType: "fleet_summary",
          html,
        });

        fleetSummaryStatus = staffFleetRes.status;
        if (staffFleetRes.status === "sent") {
          totalSent++;
          if (staffFleetRes.id) resendIds.push(staffFleetRes.id);
        }
      } catch (err: any) {
        console.error("[ExpiryScan] Error sending fleet summary digest to staff:", err);
        fleetSummaryStatus = "failed";
        failures.push(`fleet_summary: ${err?.message || err}`);
      }
    }

    // ---------------------------------------------------------------------------
    // 2. Staff-Facing Driver Licence Expiry Summary (<= 30 days)
    // ---------------------------------------------------------------------------
    type LicenceItem = {
      driverId: string;
      name: string;
      licenceType?: string;
      expiryDate: string;
      daysRemaining: number;
      reviewUrl?: string;
    };

    const licenceExpiryItems: LicenceItem[] = [];

    for (const d of drivers) {
      try {
        if (d.licence_expiry_date) {
          const days = getDaysDiff(d.licence_expiry_date, now);
          if (!isNaN(days) && days <= 30) {
            licenceExpiryItems.push({
              driverId: d.id ? d.id.slice(0, 8) : "DRIVER",
              name: d.driver_name,
              expiryDate: d.licence_expiry_date,
              daysRemaining: days,
              reviewUrl: `${CRM_BASE_URL}/drivers`,
            });
          }
        }
      } catch (err: any) {
        console.error(`[ExpiryScan] Error checking licence expiry for driver ${d.id}:`, err);
      }
    }

    if (licenceExpiryItems.length > 0) {
      try {
        const templateData = {
          headerLabel: "LICENCE COMPLIANCE",
          headline: "Driver Licences Expiring Soon",
          subtext: "Review driver licence expiry dates across your team and take required action.",
          introLine: "Hi there,\nHere are the upcoming driver licence expiry dates for your team:",
          drivers: licenceExpiryItems,
          helpUrl: `${CRM_BASE_URL}/drivers`,
        };
        const html = renderDriverLicenceSummaryTemplate(templateData);

        const staffLicenceRes = await send({
          recipient: STAFF_ALERT_RECIPIENTS,
          subject: `Driver Licence Expiry Summary — ${licenceExpiryItems.length} driver(s)`,
          emailType: "driver_licence_summary",
          html,
        });

        if (staffLicenceRes.status === "sent") {
          totalSent++;
          if (staffLicenceRes.id) resendIds.push(staffLicenceRes.id);
        }
      } catch (err: any) {
        console.error("[ExpiryScan] Error sending driver licence summary digest:", err);
      }
    }

    // ---------------------------------------------------------------------------
    // 3. Rent-Due-Tomorrow Reminders (Idempotent per driver per due date)
    // ---------------------------------------------------------------------------
    const rentDueItems: any[] = [];

    // Roll rent weeks forward first (auto Unpaid + "not paid" log for weeks that ended unpaid).
    try {
      const { syncRentCycles } = await import("@/lib/rent-cycle.server");
      const rentSync = await syncRentCycles(supabaseAdmin);
      if (rentSync.skipped) console.warn("[ExpiryScan] rent week sync skipped:", rentSync.skipped);
    } catch (err) {
      console.warn("[ExpiryScan] rent week sync failed:", err);
    }

    for (const d of drivers) {
      try {
        if (Number(d.weekly_rent || 0) > 0 && d.start_date && d.rent_due_day) {
          // Evaluate next due date relative to London local date
          const londonNow = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Europe/London" }),
          );
          const nextDue = calculateNextPaymentDueDate(d.start_date, d.rent_due_day, londonNow);
          const days = getDaysDiff(nextDue, londonNow.getTime());

          if (days === 1) {
            const dueStr = nextDue.toISOString().slice(0, 10);
            const driverEmail = d.email?.trim() || null;

            // Already paid in advance for tomorrow's week: no reminder.
            if (d.rent_paid_for_due_date && String(d.rent_paid_for_due_date).slice(0, 10) >= dueStr) {
              continue;
            }

            rentDueItems.push({
              driverName: d.driver_name,
              reg: d.reg || d.registration || "N/A",
              weeklyRent: Number(d.weekly_rent),
              dueDate: dueStr,
              rentStatus: d.rent_status || "unpaid",
              email: driverEmail,
            });

            // Idempotency check: Query if a 'rent_due' notification or email was already sent today for this driver & due date
            const startOfTodayISO = `${londonTodayStr}T00:00:00.000Z`;
            const { data: existingNotifs } = await supabaseAdmin
              .from("driver_notifications")
              .select("id")
              .eq("driver_id", d.id)
              .eq("type", "rent_due")
              .gte("created_at", startOfTodayISO)
              .limit(1);

            const alreadyProcessed = existingNotifs && existingNotifs.length > 0;

            if (!alreadyProcessed) {
              // Insert in-app CRM alert notification exactly ONCE
              await supabaseAdmin.from("driver_notifications").insert({
                driver_id: d.id,
                type: "rent_due",
                title: "Rent Payment Due Tomorrow",
                message: `Rent of £${Number(d.weekly_rent).toFixed(2)} is due tomorrow (${dueStr}).`,
              });

              // Send driver-facing rent reminder email if driver has email on file
              if (driverEmail) {
                const templateData = {
                  recipientName: d.driver_name,
                  headline: "Rent due tomorrow",
                  subtext: `Hi ${d.driver_name}, your weekly rent of £${Number(d.weekly_rent).toFixed(2)} for ${d.reg || d.registration || "your vehicle"} is due tomorrow (${dueStr}).`,
                  drivers: [
                    {
                      driverName: d.driver_name,
                      reg: d.reg || d.registration || "N/A",
                      weeklyRent: Number(d.weekly_rent),
                      dueDate: dueStr,
                      rentStatus: d.rent_status || "unpaid",
                    },
                  ],
                  actionUrl: DRIVER_PORTAL_URL,
                  actionText: "View Details",
                };
                const html = renderRentDueTomorrowTemplate(templateData);

                const rentEmailRes = await send({
                  recipient: driverEmail,
                  subject: `Reminder: Your rent is due tomorrow — Virtual Car Hire`,
                  emailType: "rent_due_tomorrow",
                  html,
                  metadata: { driver_id: d.id, weekly_rent: d.weekly_rent, due_date: dueStr },
                });

                if (rentEmailRes.status === "sent") {
                  totalSent++;
                  if (rentEmailRes.id) resendIds.push(rentEmailRes.id);
                } else if (rentEmailRes.status === "skipped") {
                  totalSkipped++;
                }
              } else {
                // Log skipped driver without blocking staff email
                totalSkipped++;
                console.info(
                  `[ExpiryScan] Driver ${d.driver_name} has no email on file. Skipped direct email, included in staff summary.`,
                );
              }
            } else {
              console.info(
                `[ExpiryScan] Rent reminder already processed today for driver ${d.id}. Skipping duplicate send.`,
              );
            }
          }
        }
      } catch (err: any) {
        console.error(`[ExpiryScan] Error processing rent due reminder for driver ${d.id}:`, err);
      }
    }

    // Send staff rent-due-tomorrow summary digest to admin@fa-ibi.co.uk for active drivers
    if (rentDueItems.length > 0) {
      try {
        const templateData = {
          recipientName: "Operations Team",
          headline: "Rent due tomorrow",
          subtext: `The following ${rentDueItems.length} active driver(s) have weekly rent due tomorrow:`,
          drivers: rentDueItems.map((item) => ({
            driverName: item.driverName,
            reg: item.reg,
            weeklyRent: item.weeklyRent,
            dueDate: item.dueDate,
            rentStatus: item.rentStatus,
          })),
          actionUrl: `${CRM_BASE_URL}/drivers`,
          actionText: "View Drivers",
        };
        const html = renderRentDueTomorrowTemplate(templateData);

        const staffRentRes = await send({
          recipient: STAFF_ALERT_RECIPIENTS,
          subject: `Rent Due Tomorrow Summary — ${rentDueItems.length} active driver(s)`,
          emailType: "rent_due_tomorrow",
          html,
        });

        if (staffRentRes.status === "sent") {
          totalSent++;
          if (staffRentRes.id) resendIds.push(staffRentRes.id);
        }
      } catch (err: any) {
        console.error("[ExpiryScan] Error sending staff rent-due-tomorrow summary email:", err);
      }
    }

    const counts = {
      trigger,
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
      fleetExpiries: fleetSummaryItems.length,
      licenceExpiries: licenceExpiryItems.length,
      rentDueItems: rentDueItems.length,
      fleetSummaryStatus,
      resendIds,
    };
    // The run only counts as a success if the staff fleet summary (when needed) actually went out,
    // so the watchdog retries a run whose main email failed.
    const mainEmailFailed = fleetSummaryStatus === "failed";
    const errorMessage = failures.length ? failures.slice(0, 5).join(" | ").slice(0, 1000) : null;
    await finishJobRun(
      supabaseAdmin,
      jobRunId,
      mainEmailFailed ? "failed" : "success",
      counts,
      errorMessage,
    );

    return {
      ok: !mainEmailFailed,
      jobRunId,
      trigger,
      sent: totalSent,
      failed: totalFailed,
      skippedEmails: totalSkipped,
      skippedCount: totalSkipped,
      fleetExpiries: fleetSummaryItems.length,
      licenceExpiries: licenceExpiryItems.length,
      rentDueItems: rentDueItems.length,
      fleetSummaryStatus,
      resendIds,
      errors: failures,
    };
  } catch (err: any) {
    const message = err?.message || String(err);
    console.error("[ExpiryScan] Run failed:", message);
    await finishJobRun(
      supabaseAdmin,
      jobRunId,
      "failed",
      { trigger, sent: totalSent, failed: totalFailed, skipped: totalSkipped },
      message.slice(0, 1000),
    );
    return {
      ...empty,
      ok: false,
      jobRunId,
      sent: totalSent,
      failed: totalFailed,
      skippedEmails: totalSkipped,
      resendIds,
      errors: [message, ...failures],
    };
  }
}
