import { CRM_BASE_URL, DRIVER_PORTAL_URL } from "@/lib/domain-config";
import {
  render2FATemplate,
  renderDriverAlertTemplate,
  renderDriverLicenceSummaryTemplate,
  renderFleetSummaryTemplate,
  renderRentDueTomorrowTemplate,
  type FleetVehicleExpiryItem,
} from "@/lib/email-templates";
import { vehicleArtworkPath } from "@/lib/vehicle-display";
import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";

export type TestKind =
  | "2fa_code"
  | "fleet_summary"
  | "driver_licence_summary"
  | "rent_due_tomorrow"
  | "driver_alert";

export interface BuiltTestEmail {
  subject: string;
  html: string;
  text?: string;
}

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

/** Up to 3 real fleet vehicles with their CRM photo, so the test shows real artwork. */
async function sampleFleetRows(): Promise<FleetVehicleExpiryItem[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("vehicles").select("*").limit(25);
    const rows = (data ?? [])
      .map((v: any) => ({ v, art: vehicleArtworkPath(v) }))
      .filter((r) => r.art)
      .slice(0, 3);
    if (rows.length > 0) {
      return rows.map(({ v, art }, i) => ({
        registration: v.reg,
        model: `${v.make} ${v.model}`,
        photoUrl: `${CRM_BASE_URL}${art}`,
        motExpiry: getNextMotDate(v) || isoInDays(5 + i),
        motDaysRemaining: 5 + i,
        pcoExpiry: i === 0 ? getPcoExpiryDate(v) || isoInDays(12) : undefined,
        pcoDaysRemaining: i === 0 ? 12 : undefined,
        detailsUrl: `${CRM_BASE_URL}/vehicles/${encodeURIComponent(v.reg)}`,
      }));
    }
  } catch (err) {
    console.warn(
      "[email-test] Could not load vehicles for fleet sample, using static sample:",
      err,
    );
  }
  return [
    {
      registration: "KN73XLB",
      model: "Mercedes-Benz EQE",
      photoUrl: `${CRM_BASE_URL}/vehicle-artwork/mercedes-eqe-transparent.png`,
      motExpiry: isoInDays(5),
      motDaysRemaining: 5,
      pcoExpiry: isoInDays(10),
      pcoDaysRemaining: 10,
      detailsUrl: `${CRM_BASE_URL}/vehicles`,
    },
  ];
}

export async function buildTestEmail(kind: TestKind, recipient: string): Promise<BuiltTestEmail> {
  const name = recipient.split("@")[0] || "there";

  switch (kind) {
    case "2fa_code": {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      return {
        subject: `[Test] Your Virtual Car Hire verification code: ${code}`,
        html: render2FATemplate({ code, recipientName: name }),
        text: `Your Virtual Car Hire verification code is: ${code}. This code expires in 10 minutes. (Test email - this code cannot be used to sign in.)`,
      };
    }
    case "fleet_summary": {
      const vehicles = await sampleFleetRows();
      return {
        subject: `[Test] Fleet MOT & PCO Expiry Summary — ${vehicles.length} vehicle(s)`,
        html: renderFleetSummaryTemplate({
          headerLabel: "FLEET COMPLIANCE",
          headline: `Multiple vehicles have upcoming MOT & PCO expiries (${vehicles.length})`,
          subtext: "Ensure your fleet remains road-legal, compliant, and ready for work.",
          vehicles,
          manageUrl: `${CRM_BASE_URL}/`,
        }),
      };
    }
    case "driver_licence_summary":
      return {
        subject: "[Test] Driver Licence Expiry Summary — 2 driver(s)",
        html: renderDriverLicenceSummaryTemplate({
          headerLabel: "LICENCE COMPLIANCE",
          headline: "Driver Licences Expiring Soon",
          subtext: "Review driver licence expiry dates across your team and take required action.",
          introLine: "Hi there,\nHere are the upcoming driver licence expiry dates for your team:",
          drivers: [
            {
              driverId: "DRV-1029",
              name: "Sample Driver A",
              licenceType: "Full UK Licence",
              expiryDate: isoInDays(12),
              daysRemaining: 12,
              reviewUrl: `${CRM_BASE_URL}/drivers`,
            },
            {
              driverId: "DRV-1044",
              name: "Sample Driver B",
              licenceType: "PCO Licence",
              expiryDate: isoInDays(25),
              daysRemaining: 25,
              reviewUrl: `${CRM_BASE_URL}/drivers`,
            },
          ],
          helpUrl: `${CRM_BASE_URL}/drivers`,
        }),
      };
    case "rent_due_tomorrow":
      return {
        subject: "[Test] Reminder: Your rent is due tomorrow — Virtual Car Hire",
        html: renderRentDueTomorrowTemplate({
          recipientName: name,
          headline: "Rent due tomorrow",
          subtext: `Hi ${name}, your weekly rent of £260.00 for KN73XLB is due tomorrow (${isoInDays(1)}).`,
          drivers: [
            {
              driverName: name,
              reg: "KN73XLB",
              weeklyRent: 260,
              dueDate: isoInDays(1),
              rentStatus: "unpaid",
            },
          ],
          actionUrl: DRIVER_PORTAL_URL,
          actionText: "View Details",
        }),
      };
    case "driver_alert":
      return {
        subject: "[Test] Important Notice: Upcoming Vehicle Expiry for KN73XLB",
        html: renderDriverAlertTemplate({
          recipientName: name,
          headline: "Vehicle Expiry Notice — KN73XLB",
          subtext: "Please review the details below and schedule an inspection.",
          cards: [
            {
              iconType: "mot",
              title: "MOT Inspection Due",
              dateStr: isoInDays(5),
              vehicleReg: "KN73XLB",
              vehicleModel: "Mercedes-Benz EQE",
              daysRemaining: 5,
            },
            {
              iconType: "pco",
              title: "PCO Licence Renewal Due",
              dateStr: isoInDays(10),
              vehicleReg: "KN73XLB",
              vehicleModel: "Mercedes-Benz EQE",
              daysRemaining: 10,
            },
          ],
          actionUrl: DRIVER_PORTAL_URL,
          actionText: "View Details in Portal",
        }),
      };
  }
}
