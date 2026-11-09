/**
 * Weekly rent cycle rules (shared by the CRM, the driver portal and the daily job).
 *
 * Each driver owes `weekly_rent` on every `rent_due_day` (e.g. Friday).
 * - The "current due date" is the most recent due day that has arrived (today counts),
 *   in Europe/London. Before the driver's first due date there is none.
 * - Clicking Paid marks that due date paid: driver_tracks.rent_paid_for_due_date = due date.
 * - The driver counts as Paid while rent_paid_for_due_date >= current due date. When the next
 *   due day arrives (7 days later) they are automatically Unpaid again.
 * - When a due date passes without being paid, that week is logged as "missed".
 *
 * Dates are plain "YYYY-MM-DD" strings so there are no timezone surprises.
 */

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtc(ymd: string): number {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  return fromUtc(toUtc(ymd) + days * 86400000);
}

export function dueDayIndex(dueDay?: string | null): number | null {
  const i = DAYS.indexOf(
    String(dueDay || "")
      .trim()
      .toLowerCase(),
  );
  return i === -1 ? null : i;
}

/** First due date on or after the driver's start date. */
export function firstDueDate(dueDay: string, startDate?: string | null): string | null {
  const idx = dueDayIndex(dueDay);
  if (idx === null || !startDate) return null;
  const start = startDate.slice(0, 10);
  const dow = new Date(toUtc(start)).getUTCDay();
  return addDays(start, (idx - dow + 7) % 7);
}

/** Most recent due date on or before `today`, or null if none yet (before the first due date). */
export function currentDueDate(
  dueDay: string | null | undefined,
  today: string,
  startDate?: string | null,
): string | null {
  const idx = dueDayIndex(dueDay);
  if (idx === null) return null;
  const dow = new Date(toUtc(today)).getUTCDay();
  const due = addDays(today, -((dow - idx + 7) % 7));
  const first = startDate ? firstDueDate(dueDay as string, startDate) : null;
  if (first && due < first) return null;
  return due;
}

/** Next due date strictly after today (or the first due date if it is still ahead). */
export function nextDueDate(
  dueDay: string | null | undefined,
  today: string,
  startDate?: string | null,
): string | null {
  const idx = dueDayIndex(dueDay);
  if (idx === null) return null;
  const first = startDate ? firstDueDate(dueDay as string, startDate) : null;
  if (first && first > today) return first;
  const dow = new Date(toUtc(today)).getUTCDay();
  const ahead = (idx - dow + 7) % 7 || 7;
  return addDays(today, ahead);
}

export type RentDriverFields = {
  weekly_rent?: number | null;
  rent_due_day?: string | null;
  start_date?: string | null;
  rent_status?: string | null;
  rent_paid_for_due_date?: string | null;
};

export type RentState = {
  /** Due date the current week is for (null before the first due date). */
  currentDue: string | null;
  /** Next due date after today. */
  nextDue: string | null;
  /** True when the current week (or, before the first due date, the first week) is paid. */
  paid: boolean;
  /** Due date the Paid button would mark paid now. */
  payableDue: string | null;
};

/**
 * Effective status. If rent_paid_for_due_date is not tracked yet (column missing / never set),
 * falls back to the stored rent_status so existing data keeps working until the SQL is run.
 */
export function rentState(d: RentDriverFields, today: string = londonToday()): RentState {
  const currentDue = currentDueDate(d.rent_due_day, today, d.start_date);
  const nextDue = nextDueDate(d.rent_due_day, today, d.start_date);
  const paidThrough = d.rent_paid_for_due_date ? d.rent_paid_for_due_date.slice(0, 10) : null;

  let paid: boolean;
  if (d.rent_paid_for_due_date === undefined) {
    paid = d.rent_status === "paid";
  } else if (currentDue) {
    paid = !!paidThrough && paidThrough >= currentDue;
  } else {
    // Before the first due date: paid only if the first week was paid in advance.
    paid = !!paidThrough && !!nextDue && paidThrough >= nextDue;
  }
  return { currentDue, nextDue, paid, payableDue: currentDue ?? nextDue };
}
