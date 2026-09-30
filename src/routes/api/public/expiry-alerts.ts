import { createFileRoute } from "@tanstack/react-router";

import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { calculateNextPaymentDueDate } from "@/lib/fleet-data";
import { vehicleArtworkPath } from "@/lib/vehicle-display";
import { CRM_BASE_URL, DRIVER_PORTAL_URL } from "@/lib/domain-config";

const STAFF_ALERT_EMAIL = "notifications@fa-ibi.co.uk";

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

async function runExpiryScan() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

      const motExpiring = motDays !== undefined && motDays <= 7 && motDays >= 0;
      const pcoExpiring = pcoDays !== undefined && pcoDays <= 10 && pcoDays >= 0;

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

        // Find driver assigned to this vehicle for single-vehicle driver-facing notice
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

          if (driverRes.data?.status === "sent") totalSent++;
          if (driverRes.data?.status === "skipped") totalSkipped++;
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

      if (staffFleetRes.data?.status === "sent") totalSent++;
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
        if (!isNaN(days) && days <= 30 && days >= 0) {
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

      if (staffLicenceRes.data?.status === "sent") totalSent++;
    } catch (err: any) {
      console.error("[ExpiryScan] Error sending driver licence summary digest:", err);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Rent-Due-Tomorrow Reminders (Staff Digest to notifications@fa-ibi.co.uk + Active Driver Notices)
  // ---------------------------------------------------------------------------
  const rentDueItems: any[] = [];

  for (const d of drivers) {
    try {
      if (Number(d.weekly_rent || 0) > 0 && d.start_date && d.rent_due_day) {
        const nextDue = calculateNextPaymentDueDate(d.start_date, d.rent_due_day, new Date(now));
        const days = getDaysDiff(nextDue, now);

        if (days === 1) {
          const dueStr = nextDue.toISOString().slice(0, 10);
          const driverEmail = d.email?.trim() || null;

          rentDueItems.push({
            driverName: d.driver_name,
            reg: d.reg || "N/A",
            weeklyRent: Number(d.weekly_rent),
            dueDate: dueStr,
            email: driverEmail,
          });

          // Insert in-app CRM alert notification
          await supabaseAdmin.from("driver_notifications").insert({
            driver_id: d.id,
            type: "rent_due",
            title: "Rent Payment Due Tomorrow",
            message: `Rent of £${Number(d.weekly_rent).toFixed(2)} is due tomorrow (${dueStr}).`,
          });

          // Send driver-facing rent reminder email if active driver has email on file
          if (driverEmail) {
            const rentEmailRes = await supabaseAdmin.functions.invoke("send-email", {
              body: {
                recipient: driverEmail,
                subject: `Reminder: Your rent is due tomorrow — Virtual Car Hire`,
                template_type: "rent_due_tomorrow",
                template_data: {
                  recipientName: d.driver_name,
                  headline: "Rent Due Tomorrow",
                  introLine: `Hi ${d.driver_name}, your rent is due tomorrow.`,
                  cards: [
                    {
                      iconType: "rent",
                      title: `Weekly Rent Payment (£${Number(d.weekly_rent).toFixed(2)})`,
                      dateStr: dueStr,
                      vehicleReg: d.reg || "N/A",
                      daysRemaining: 1,
                    },
                  ],
                  warningNote:
                    "Prompt rent payments help maintain your vehicle account in good standing. Please contact support if you have any questions.",
                  actionUrl: DRIVER_PORTAL_URL,
                  actionText: "View Balance in Driver Portal",
                },
                metadata: { driver_id: d.id, weekly_rent: d.weekly_rent },
              },
            });

            if (rentEmailRes.data?.status === "sent") totalSent++;
            if (rentEmailRes.data?.status === "skipped") totalSkipped++;
          }
        }
      }
    } catch (err: any) {
      console.error(`[ExpiryScan] Error processing rent due reminder for driver ${d.id}:`, err);
    }
  }

  // Send rent-due-tomorrow email to staff at notifications@fa-ibi.co.uk for active drivers
  if (rentDueItems.length > 0) {
    try {
      const staffRentRes = await supabaseAdmin.functions.invoke("send-email", {
        body: {
          recipient: STAFF_ALERT_EMAIL,
          subject: `Rent Due Tomorrow Summary — ${rentDueItems.length} active driver(s)`,
          template_type: "rent_due_tomorrow",
          template_data: {
            recipientName: "Operations Team",
            headline: `Rent Payments Due Tomorrow (${rentDueItems.length} Active Drivers)`,
            introLine: `The following active drivers have weekly rent due tomorrow:`,
            cards: rentDueItems.map((item) => ({
              iconType: "rent",
              title: `${item.driverName} — £${item.weeklyRent.toFixed(2)}/wk (${item.reg})`,
              dateStr: item.dueDate,
              vehicleReg: item.reg,
              daysRemaining: 1,
            })),
            actionUrl: `${CRM_BASE_URL}/drivers`,
            actionText: "Manage Drivers in CRM",
          },
        },
      });

      if (staffRentRes.data?.status === "sent") totalSent++;
    } catch (err: any) {
      console.error("[ExpiryScan] Error sending staff rent-due-tomorrow summary email:", err);
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      sent: totalSent,
      skipped: totalSkipped,
      fleetExpiries: fleetSummaryItems.length,
      licenceExpiries: licenceExpiryItems.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
