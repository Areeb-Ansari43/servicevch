/**
 * Service due state for a vehicle, like the mileage sheet's colours:
 *  - overdue (red): past the next-service mileage, or past the next-service date;
 *  - soon (yellow): within 1,500 miles of the next-service mileage, or within 14 days of the date;
 *  - ok: anything else. null when nothing is known (e.g. electric cars with no service mileage).
 */
export const SERVICE_SOON_MILES = 1500;
export const SERVICE_SOON_DAYS = 14;

export type ServiceDue = {
  state: "overdue" | "soon" | "ok";
  milesLeft: number | null;
  daysLeft: number | null;
  label: string;
};

export function serviceDue(
  v: { current_mileage?: number | null; next_service_mileage?: number | null; next_service_date?: string | null },
  today: Date = new Date(),
): ServiceDue | null {
  const next = Number(v.next_service_mileage || 0);
  const now = Number(v.current_mileage || 0);
  const milesLeft = next > 0 && now > 0 ? next - now : null;
  let daysLeft: number | null = null;
  if (v.next_service_date) {
    const t = new Date(`${String(v.next_service_date).slice(0, 10)}T12:00:00`).getTime();
    if (!Number.isNaN(t)) daysLeft = Math.round((t - today.getTime()) / 86400000);
  }
  if (milesLeft === null && daysLeft === null) return null;

  const overdue = (milesLeft !== null && milesLeft < 0) || (daysLeft !== null && daysLeft < 0);
  const soon = (milesLeft !== null && milesLeft <= SERVICE_SOON_MILES) || (daysLeft !== null && daysLeft <= SERVICE_SOON_DAYS);
  const fmt = (n: number) => Math.abs(n).toLocaleString("en-GB");
  let label: string;
  if (overdue) {
    label = milesLeft !== null && milesLeft < 0 ? `Service overdue · ${fmt(milesLeft)} mi over` : `Service overdue · ${fmt(daysLeft!)} days late`;
  } else if (soon) {
    label = milesLeft !== null && milesLeft <= SERVICE_SOON_MILES ? `Service due soon · ${fmt(milesLeft)} mi left` : `Service due soon · ${daysLeft} days`;
  } else {
    label = milesLeft !== null ? `Next service in ${fmt(milesLeft)} mi` : `Next service in ${daysLeft} days`;
  }
  return { state: overdue ? "overdue" : soon ? "soon" : "ok", milesLeft, daysLeft, label };
}
