import { createFileRoute } from "@tanstack/react-router";

import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { calculateNextPaymentDueDate } from "@/lib/fleet-data";
import { vehicleArtworkPath } from "@/lib/vehicle-display";
import { CRM_BASE_URL, DRIVER_PORTAL_URL } from "@/lib/domain-config";

const STAFF_ALERT_EMAIL = "notifications@fa-ibi.co.uk";
const STAFF_RENT_ADMIN_EMAIL = "admin@fa-ibi.co.uk";

export const Route = createFileRoute("/api/public/expiry-alerts")({
  server: {
    handlers: {
      POST: async () => runExpiryScan(),
      GET: async () => runExpiryScan(),
    },
  },
});

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

async function runExpiryScan() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Log job start in job_runs table
  let jobRunId: string | null = null;
  try {
    const { data: runData } = await supabaseAdmin
      .from("job_runs")
      .insert({
        job_name: "expiry-alerts",
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (runData) jobRunId = runData.id;
  } catch (err) {
    console.warn("[ExpiryScan] Could not insert job_runs start log:", err);
  }

  const [vRes, dRes] = await Promise.all([
    supabaseAdmin.from("vehicles").select("*"),
    supabaseAdmin.from("driver_tracks").select("*").neq("active", false).is("deleted_at", null),
  ]);

  if (vRes.error) {
    return new Response(JSON.stringify({ ok: false, error: vRes.error.message }), { status: 500 });
  }

  const vehicles = vRes.data ?? [];
  const rawDrivers = dRes.data ?? [];
  // Exclude inactive drivers
  const drivers = rawDrivers.filter((d) => d.status !== "inactive" && d.active !== false);

  const now = Date.now();
  const londonTodayStr = getLondonTodayISO();
  let totalSent = 0;
  let totalSkipped = 0;

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
          const driverRes = await supabaseAdmin.functions.invoke("send-email", {
            body: {
              recipient: driverEmail || "none",
              skip: !driverEmail,
              skip_reason: `Driver ${assignedDriver.driver_name} has no email on file`,
              subject: `Important Notice: Upcoming Vehicle Expiry for ${v.reg}`,
              template_type: "driver_alert",
              template_data: {
                recipientName: assignedDriver.driver_name,
                headline: `Vehicle Expiry Notice — ${v.reg}`,
                subtext: "Please review the details below and schedule an inspection.",
                cards,
                actionUrl: DRIVER_PORTAL_URL,
                actionText: "View Details in Portal",
              },
              metadata: { vehicle_reg: v.reg, driver_id: assignedDriver.id },
            },
          });

          if (driverRes.error) {
            console.error(`[ExpiryScan] Error sending driver alert email for ${assignedDriver.id}:`, driverRes.error);
          } else if (driverRes.data?.status === "sent") {
            totalSent++;
          } else if (driverRes.data?.status === "skipped") {
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
      const staffFleetRes = await supabaseAdmin.functions.invoke("send-email", {
        body: {
          recipient: STAFF_ALERT_EMAIL,
          subject: `Fleet MOT & PCO Expiry Summary — ${fleetSummaryItems.length} vehicle(s)`,
          template_type: "fleet_summary",
          template_data: {
            headerLabel: "FLEET COMPLIANCE",
            headline: `Multiple vehicles have upcoming MOT & PCO expiries (${fleetSummaryItems.length})`,
            subtext: "Ensure your fleet remains road-legal, compliant, and ready for work.",
            vehicles: fleetSummaryItems,
            manageUrl: `${CRM_BASE_URL}/`,
          },
        },
      });

      if (staffFleetRes.error) {
        console.error("[ExpiryScan] Error sending staff fleet summary:", staffFleetRes.error);
      } else if (staffFleetRes.data?.status === "sent") {
        totalSent++;
      }
    } catch (err: any) {
      console.error("[ExpiryScan] Error sending fleet summary digest to staff:", err);
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
      const staffLicenceRes = await supabaseAdmin.functions.invoke("send-email", {
        body: {
          recipient: STAFF_ALERT_EMAIL,
          subject: `Driver Licence Expiry Summary — ${licenceExpiryItems.length} driver(s)`,
          template_type: "driver_licence_summary",
          template_data: {
            headerLabel: "LICENCE COMPLIANCE",
            headline: "Driver Licences Expiring Soon",
            subtext: "Review driver licence expiry dates across your team and take required action.",
            introLine: "Hi there,\nHere are the upcoming driver licence expiry dates for your team:",
            drivers: licenceExpiryItems,
            helpUrl: `${CRM_BASE_URL}/drivers`,
          },
        },
      });

      if (staffLicenceRes.error) {
        console.error("[ExpiryScan] Error sending driver licence summary:", staffLicenceRes.error);
      } else if (staffLicenceRes.data?.status === "sent") {
        totalSent++;
      }
    } catch (err: any) {
      console.error("[ExpiryScan] Error sending driver licence summary digest:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Rent-Due-Tomorrow Reminders (Idempotent per driver per due date)
  // ---------------------------------------------------------------------------
  const rentDueItems: any[] = [];

  for (const d of drivers) {
    try {
      if (Number(d.weekly_rent || 0) > 0 && d.start_date && d.rent_due_day) {
        // Evaluate next due date relative to London local date
        const londonNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
        const nextDue = calculateNextPaymentDueDate(d.start_date, d.rent_due_day, londonNow);
        const days = getDaysDiff(nextDue, londonNow.getTime());

        if (days === 1) {
          const dueStr = nextDue.toISOString().slice(0, 10);
          const driverEmail = d.email?.trim() || null;

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
              const rentEmailRes = await supabaseAdmin.functions.invoke("send-email", {
                body: {
                  recipient: driverEmail,
                  subject: `Reminder: Your rent is due tomorrow — Virtual Car Hire`,
                  template_type: "rent_due_tomorrow",
                  template_data: {
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
                    actionText: "View Drivers",
                  },
                  metadata: { driver_id: d.id, weekly_rent: d.weekly_rent, due_date: dueStr },
                },
              });

              if (rentEmailRes.error) {
                console.error(`[ExpiryScan] Resend error sending rent email to ${driverEmail}:`, rentEmailRes.error);
              } else if (rentEmailRes.data?.status === "sent") {
                totalSent++;
              } else if (rentEmailRes.data?.status === "skipped") {
                totalSkipped++;
              }
            } else {
              // Log skipped driver without blocking staff email
              totalSkipped++;
              console.info(`[ExpiryScan] Driver ${d.driver_name} has no email on file. Skipped direct email, included in staff summary.`);
            }
          } else {
            console.info(`[ExpiryScan] Rent reminder already processed today for driver ${d.id}. Skipping duplicate send.`);
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
      const staffRentRes = await supabaseAdmin.functions.invoke("send-email", {
        body: {
          recipient: STAFF_RENT_ADMIN_EMAIL,
          subject: `Rent Due Tomorrow Summary — ${rentDueItems.length} active driver(s)`,
          template_type: "rent_due_tomorrow",
          template_data: {
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
          },
        },
      });

      if (staffRentRes.error) {
        console.error("[ExpiryScan] Error sending staff rent summary email:", staffRentRes.error);
      } else if (staffRentRes.data?.status === "sent") {
        totalSent++;
      }
    } catch (err: any) {
      console.error("[ExpiryScan] Error sending staff rent-due-tomorrow summary email:", err);
    }
  }

  const resultCounts = {
    sent: totalSent,
    skipped: totalSkipped,
    fleetExpiries: fleetSummaryItems.length,
    licenceExpiries: licenceExpiryItems.length,
    rentDueItems: rentDueItems.length,
  };

  if (jobRunId) {
    try {
      await supabaseAdmin
        .from("job_runs")
        .update({
          status: "success",
          completed_at: new Date().toISOString(),
          counts: resultCounts,
        })
        .eq("id", jobRunId);
    } catch (err) {
      console.warn("[ExpiryScan] Could not update job_runs success log:", err);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ...resultCounts,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
