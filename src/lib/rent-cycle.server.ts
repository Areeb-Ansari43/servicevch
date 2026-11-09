import { addDays, londonToday, rentState } from "@/lib/rent-cycle";

/**
 * Server-side weekly rent bookkeeping (service-role DB client passed in).
 *
 * Tables / columns (created by supabase/manual/2026-11-09-bot-catalog-and-portal-fixes.sql):
 *   rent_week_log (driver_id, due_date, status 'paid' | 'missed', amount, recorded_at, recorded_by)
 *   driver_tracks.rent_paid_for_due_date  latest due date marked paid
 *   driver_tracks.rent_charged_through    latest due date whose rent was added to balance_due
 */

type Db = any;
const LOG = "rent_week_log";

export const RENT_SQL_HINT =
  "Run supabase/manual/2026-11-09-bot-catalog-and-portal-fixes.sql to enable weekly rent history.";

function isMissingSchema(message?: string): boolean {
  return /rent_week_log|rent_paid_for_due_date|rent_charged_through|schema cache|does not exist|column/i.test(
    message || "",
  );
}

async function loadLogs(db: Db, driverId: string): Promise<{ rows: any[]; missing: boolean }> {
  const { data, error } = await db
    .from(LOG)
    .select("*")
    .eq("driver_id", driverId)
    .order("due_date", { ascending: false })
    .limit(200);
  if (error) return { rows: [], missing: isMissingSchema(error.message) };
  return { rows: data ?? [], missing: false };
}

function latestPaid(rows: any[]): string | null {
  const paid = rows.filter((r) => r.status === "paid").map((r) => String(r.due_date).slice(0, 10));
  return paid.length ? paid.sort().at(-1)! : null;
}

export type RentSyncResult = { drivers: number; charged: number; missed: number; skipped?: string };

/**
 * Rolls every driver forward to today's rent week:
 *  - for each due date that has arrived since the last run: logs the previous week as "missed"
 *    if it was never paid, and adds that week's rent to balance_due (unless paid in advance);
 *  - sets rent_status to Paid/Unpaid for the current week.
 * Idempotent: driver_tracks.rent_charged_through records how far each driver has been charged.
 */
export async function syncRentCycles(
  db: Db,
  today: string = londonToday(),
): Promise<RentSyncResult> {
  const { data: drivers, error } = await db
    .from("driver_tracks")
    .select(
      "id, weekly_rent, rent_due_day, start_date, rent_status, balance_due, rent_paid_for_due_date, rent_charged_through, active, deleted_at, status",
    )
    .is("deleted_at", null);
  if (error) {
    return {
      drivers: 0,
      charged: 0,
      missed: 0,
      skipped: isMissingSchema(error.message) ? RENT_SQL_HINT : error.message,
    };
  }

  let charged = 0;
  let missed = 0;
  let count = 0;
  for (const d of drivers ?? []) {
    const weekly = Number(d.weekly_rent || 0);
    if (!weekly || !d.rent_due_day || d.active === false || d.status === "inactive") continue;
    const state = rentState(d, today);
    if (!state.currentDue) continue;
    count++;

    let chargedThrough: string | null = d.rent_charged_through
      ? String(d.rent_charged_through).slice(0, 10)
      : null;
    let balance = Number(d.balance_due || 0);
    let paidThrough: string | null = d.rent_paid_for_due_date
      ? String(d.rent_paid_for_due_date).slice(0, 10)
      : null;

    if (!chargedThrough) {
      // First run for this driver: today's balance already reflects the current week.
      chargedThrough = state.currentDue;
    } else if (chargedThrough < state.currentDue) {
      const { rows } = await loadLogs(db, d.id);
      const paidDates = new Set(
        rows.filter((r) => r.status === "paid").map((r) => String(r.due_date).slice(0, 10)),
      );
      paidThrough = paidThrough ?? latestPaid(rows);
      const isPaid = (due: string) => paidDates.has(due);

      for (let due = addDays(chargedThrough, 7); due <= state.currentDue; due = addDays(due, 7)) {
        const prev = addDays(due, -7);
        // The week that started on `prev` has now finished.
        if (!isPaid(prev) && !rows.some((r) => String(r.due_date).slice(0, 10) === prev)) {
          const { error: insErr } = await db
            .from(LOG)
            .insert({
              driver_id: d.id,
              due_date: prev,
              status: "missed",
              amount: weekly,
              recorded_by: "system",
            });
          if (!insErr) missed++;
        }
        // New week's rent is now owed (unless it was paid in advance).
        if (!isPaid(due)) {
          balance += weekly;
          charged++;
        }
      }
      chargedThrough = state.currentDue;
    }

    const nowPaid = rentState({ ...d, rent_paid_for_due_date: paidThrough }, today).paid;
    await db
      .from("driver_tracks")
      .update({
        rent_charged_through: chargedThrough,
        rent_paid_for_due_date: paidThrough,
        balance_due: balance,
        rent_status: nowPaid ? "paid" : "unpaid",
      })
      .eq("id", d.id);
  }
  return { drivers: count, charged, missed };
}

export type RentActionResult = {
  ok: boolean;
  status: "paid" | "unpaid";
  dueDate: string | null;
  balance: number;
  legacy?: boolean;
  warning?: string;
  error?: string;
};

/**
 * Paid / Unpaid button.
 *  - "paid": marks `dueDate` (default: the current week) paid and logs it.
 *  - "unpaid": undoes the payment for `dueDate` (default: the latest paid week).
 */
export async function recordRentAction(
  db: Db,
  driverId: string,
  action: "paid" | "unpaid",
  opts: {
    dueDate?: string | null;
    recordedBy?: string | null;
    today?: string;
    keepBalance?: boolean;
  } = {},
): Promise<RentActionResult> {
  const today = opts.today ?? londonToday();
  const { data: d, error } = await db
    .from("driver_tracks")
    .select("*")
    .eq("id", driverId)
    .maybeSingle();
  if (error || !d)
    return {
      ok: false,
      status: "unpaid",
      dueDate: null,
      balance: 0,
      error: error?.message || "Driver not found",
    };

  const weekly = Number(d.weekly_rent || 0);
  const balance = Number(d.balance_due || 0);
  const logs = await loadLogs(db, driverId);
  const tracked = !logs.missing && d.rent_paid_for_due_date !== undefined;

  if (!tracked) {
    // Schema not migrated yet: behave exactly like the old toggle.
    const newBalance = action === "paid" ? 0 : balance === 0 ? weekly : balance + weekly;
    await db
      .from("driver_tracks")
      .update({ rent_status: action, balance_due: newBalance })
      .eq("id", driverId);
    return {
      ok: true,
      status: action,
      dueDate: null,
      balance: newBalance,
      legacy: true,
      warning: RENT_SQL_HINT,
    };
  }

  const state = rentState(d, today);
  const chargedThrough: string | null = d.rent_charged_through
    ? String(d.rent_charged_through).slice(0, 10)
    : state.currentDue;
  let newBalance = balance;
  let dueDate: string | null;

  if (action === "paid") {
    dueDate = (opts.dueDate || state.payableDue || null) as string | null;
    if (!dueDate)
      return {
        ok: false,
        status: "unpaid",
        dueDate: null,
        balance,
        error: "No rent due day set for this driver.",
      };
    const { error: upErr } = await db.from(LOG).upsert(
      {
        driver_id: driverId,
        due_date: dueDate,
        status: "paid",
        amount: weekly,
        recorded_at: new Date().toISOString(),
        recorded_by: opts.recordedBy || null,
      },
      { onConflict: "driver_id,due_date" },
    );
    if (upErr) return { ok: false, status: "unpaid", dueDate, balance, error: upErr.message };
    // Only reduce the balance if that week's rent had already been added to it.
    if (chargedThrough && dueDate <= chargedThrough) newBalance = Math.max(0, balance - weekly);
  } else {
    const paidThroughNow = d.rent_paid_for_due_date
      ? String(d.rent_paid_for_due_date).slice(0, 10)
      : latestPaid(logs.rows);
    dueDate = (opts.dueDate || paidThroughNow || null) as string | null;
    if (!dueDate)
      return {
        ok: false,
        status: "unpaid",
        dueDate: null,
        balance,
        error: "No paid week to undo.",
      };
    if (state.currentDue && dueDate < state.currentDue) {
      await db
        .from(LOG)
        .update({
          status: "missed",
          recorded_at: new Date().toISOString(),
          recorded_by: opts.recordedBy || null,
        })
        .eq("driver_id", driverId)
        .eq("due_date", dueDate);
    } else {
      await db.from(LOG).delete().eq("driver_id", driverId).eq("due_date", dueDate);
    }
    if (chargedThrough && dueDate <= chargedThrough) newBalance = balance + weekly;
  }

  if (opts.keepBalance) newBalance = balance;
  const after = await loadLogs(db, driverId);
  const paidThrough = latestPaid(after.rows);
  const nowPaid = rentState({ ...d, rent_paid_for_due_date: paidThrough }, today).paid;
  await db
    .from("driver_tracks")
    .update({
      rent_paid_for_due_date: paidThrough,
      rent_charged_through: chargedThrough,
      balance_due: newBalance,
      rent_status: nowPaid ? "paid" : "unpaid",
    })
    .eq("id", driverId);

  return { ok: true, status: nowPaid ? "paid" : "unpaid", dueDate, balance: newBalance };
}

export type RentHistoryEntry = {
  due_date: string;
  status: "paid" | "missed" | "due" | "upcoming";
  amount: number;
  recorded_at: string | null;
  recorded_by: string | null;
};

/** Week-by-week history for one driver (newest first), including the current week. */
export async function getRentHistory(db: Db, driverId: string, today: string = londonToday()) {
  const { data: d } = await db.from("driver_tracks").select("*").eq("id", driverId).maybeSingle();
  const logs = await loadLogs(db, driverId);
  if (!d)
    return { ok: false as const, error: "Driver not found", entries: [] as RentHistoryEntry[] };
  if (logs.missing)
    return { ok: false as const, error: RENT_SQL_HINT, entries: [] as RentHistoryEntry[] };

  const entries: RentHistoryEntry[] = logs.rows.map((r) => ({
    due_date: String(r.due_date).slice(0, 10),
    status: r.status === "paid" ? "paid" : "missed",
    amount: Number(r.amount || 0),
    recorded_at: r.recorded_at ?? null,
    recorded_by: r.recorded_by ?? null,
  }));
  const state = rentState(d, today);
  if (state.currentDue && !entries.some((e) => e.due_date === state.currentDue)) {
    entries.unshift({
      due_date: state.currentDue,
      status: "due",
      amount: Number(d.weekly_rent || 0),
      recorded_at: null,
      recorded_by: null,
    });
  }
  if (state.nextDue && !entries.some((e) => e.due_date === state.nextDue)) {
    entries.unshift({
      due_date: state.nextDue,
      status: "upcoming",
      amount: Number(d.weekly_rent || 0),
      recorded_at: null,
      recorded_by: null,
    });
  }
  entries.sort((a, b) => (a.due_date < b.due_date ? 1 : -1));
  return { ok: true as const, state, entries };
}
