import { createFileRoute } from "@tanstack/react-router";

import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { calculateNextPaymentDueDate } from "@/lib/fleet-data";
import { vehicleArtworkPath } from "@/lib/vehicle-display";
import { CRM_BASE_URL, DRIVER_PORTAL_URL } from "@/lib/domain-config";

const STAFF_ALERT_EMAIL = "admin@fa-ibi.co.uk";

export const Route = createFileRoute("/api/public/expiry-alerts")({
  server: {
    handlers: {
      POST: async () => runExpiryScan(),
      GET: async () => runExpiryScan(),
    },
  },
});

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
  const drivers = dRes.data ?? [];

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
    const motDate = getNextMotDate(v);
    const pcoDate = getPcoExpiryDate(v);

    let motDays: number | undefined = undefined;
    let pcoDays: number | undefined = undefined;

    if (motDate) {
      const t = new Date(motDate).getTime();
      if (!isNaN(t)) motDays = Math.ceil((t - now) / 86400000);
    }

    if (pcoDate) {
      const t = new Date(pcoDate).getTime();
      if (!isNaN(t)) pcoDays = Math.ceil((t - now) / 86400000);
    }

    const motExpiring = motDays !== undefined && motDays <= 7;
    const pcoExpiring = pcoDays !== undefined && pcoDays <= 10;

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
  }

  // Send Fleet Summary digest to staff if vehicles have upcoming expiries
  if (fleetSummaryItems.length > 0) {
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
    if (d.licence_expiry_date) {
      const t = new Date(d.licence_expiry_date).getTime();
      if (!isNaN(t)) {
        const days = Math.ceil((t - now) / 86400000);
        if (days <= 30) {
          licenceExpiryItems.push({
            driverId: d.id ? d.id.slice(0, 8) : "DRIVER",
            name: d.driver_name,
            expiryDate: d.licence_expiry_date,
            daysRemaining: days,
            reviewUrl: `${CRM_BASE_URL}/drivers`,
          });
        }
      }
    }
  }

  if (licenceExpiryItems.length > 0) {
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
  }

  // ---------------------------------------------------------------------------
  // 3. Rent-Due-Tomorrow Reminder to Driver (via notifications@fa-ibi.co.uk)
  // ---------------------------------------------------------------------------
  for (const d of drivers) {
    if (Number(d.weekly_rent || 0) > 0 && d.start_date && d.rent_due_day) {
      const nextDue = calculateNextPaymentDueDate(d.start_date, d.rent_due_day, new Date(now));
      const days = Math.ceil((nextDue.getTime() - now) / 86400000);

      if (days === 1) {
        const driverEmail = d.email?.trim() || null;
        const dueStr = nextDue.toISOString().slice(0, 10);

        // Also add in-app CRM alert notification for staff/driver tracking
        await supabaseAdmin.from("driver_notifications").insert({
          driver_id: d.id,
          type: "rent_due",
          title: "Rent Payment Due Tomorrow",
          message: `Rent of £${Number(d.weekly_rent).toFixed(2)} is due tomorrow (${dueStr}).`,
        });

        // Send email via notifications@fa-ibi.co.uk to driver's email address
        const rentEmailRes = await supabaseAdmin.functions.invoke("send-email", {
          body: {
            recipient: driverEmail || "none",
            skip: !driverEmail,
            skip_reason: `Driver ${d.driver_name} has no email on file for rent reminder`,
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
