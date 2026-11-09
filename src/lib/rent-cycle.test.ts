import { beforeEach, describe, expect, it } from "bun:test";
import { currentDueDate, nextDueDate, rentState } from "./rent-cycle";
import { getRentHistory, recordRentAction, syncRentCycles } from "./rent-cycle.server";

// ---- tiny in-memory stand-in for the Supabase query builder ----------------------------
type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function q(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "delete" = "select";
  let patch: Row = {};
  let lim = Infinity;
  let desc = false;
  let orderCol: string | null = null;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const result = () => {
    if (op === "update") rows().forEach((r) => Object.assign(r, patch));
    if (op === "delete")
      tables[table] = (tables[table] ?? []).filter((r) => !filters.every((f) => f(r)));
    let out = op === "select" ? [...rows()] : null;
    if (out && orderCol)
      out.sort((a, b) => (a[orderCol!] < b[orderCol!] ? -1 : 1) * (desc ? -1 : 1));
    if (out) out = out.slice(0, lim);
    return { data: out, error: null };
  };
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), b),
    order: (c: string, o?: { ascending?: boolean }) => (
      (orderCol = c),
      (desc = o?.ascending === false),
      b
    ),
    limit: (n: number) => ((lim = n), b),
    update: (p: Row) => ((op = "update"), (patch = p), b),
    delete: () => ((op = "delete"), b),
    insert: (row: Row) => {
      const t = (tables[table] ??= []);
      if (t.some((r) => r.driver_id === row.driver_id && r.due_date === row.due_date)) {
        return {
          ...b,
          then: (res: any) => res({ data: null, error: { message: "duplicate key" } }),
        };
      }
      t.push({ recorded_at: new Date().toISOString(), ...row });
      return { ...b, then: (res: any) => res({ data: null, error: null }) };
    },
    upsert: (row: Row) => {
      const t = (tables[table] ??= []);
      const existing = t.find((r) => r.driver_id === row.driver_id && r.due_date === row.due_date);
      if (existing) Object.assign(existing, row);
      else t.push(row);
      return Promise.resolve({ data: null, error: null });
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: any) => res(result()),
  };
  return b;
}
const db = { from: (t: string) => q(t) };

// Due day Friday. 14 Nov 2026 is a Saturday, so use Friday 13 / 20 / 27 Nov.
const driver = () => tables.driver_tracks[0];

beforeEach(() => {
  tables = {
    driver_tracks: [
      {
        id: "d1",
        weekly_rent: 260,
        rent_due_day: "Friday",
        start_date: "2026-10-02",
        rent_status: "unpaid",
        balance_due: 260,
        rent_paid_for_due_date: null,
        rent_charged_through: "2026-11-13",
        deleted_at: null,
        active: true,
      },
    ],
    rent_week_log: [],
  };
});

describe("rent week dates", () => {
  it("current due date is the latest due day that has arrived (today counts)", () => {
    expect(currentDueDate("Friday", "2026-11-13")).toBe("2026-11-13");
    expect(currentDueDate("Friday", "2026-11-19")).toBe("2026-11-13");
    expect(currentDueDate("Friday", "2026-11-20")).toBe("2026-11-20");
    expect(nextDueDate("Friday", "2026-11-13")).toBe("2026-11-20");
    expect(currentDueDate("Friday", "2026-11-13", "2026-11-14")).toBeNull(); // before first week
  });

  it("Paid stays Paid for 7 days, then flips back to Unpaid on the next due day", () => {
    const d = { weekly_rent: 260, rent_due_day: "Friday", rent_paid_for_due_date: "2026-11-13" };
    expect(rentState(d, "2026-11-13").paid).toBe(true);
    expect(rentState(d, "2026-11-19").paid).toBe(true);
    expect(rentState(d, "2026-11-20").paid).toBe(false);
  });

  it("falls back to the stored status until the SQL has been run", () => {
    expect(rentState({ rent_due_day: "Friday", rent_status: "paid" }, "2026-11-20").paid).toBe(
      true,
    );
  });
});

describe("Paid button, weekly rollover and history", () => {
  it("click Paid on the 13th: logged, balance cleared; on the 20th it is Unpaid and rent is added", async () => {
    const res = await recordRentAction(db, "d1", "paid", {
      today: "2026-11-13",
      recordedBy: "admin@fa-ibi.co.uk",
    });
    expect(res).toMatchObject({ ok: true, status: "paid", dueDate: "2026-11-13", balance: 0 });
    expect(tables.rent_week_log).toHaveLength(1);
    expect(tables.rent_week_log[0]).toMatchObject({
      due_date: "2026-11-13",
      status: "paid",
      amount: 260,
      recorded_by: "admin@fa-ibi.co.uk",
    });

    // Still paid the next day, nothing charged
    await syncRentCycles(db, "2026-11-19");
    expect(driver()).toMatchObject({ rent_status: "paid", balance_due: 0 });

    // Next due day arrives: back to Unpaid, this week's rent owed, last week was paid (no "missed")
    const sync = await syncRentCycles(db, "2026-11-20");
    expect(sync).toMatchObject({ charged: 1, missed: 0 });
    expect(driver()).toMatchObject({
      rent_status: "unpaid",
      balance_due: 260,
      rent_charged_through: "2026-11-20",
    });

    // Re-running the same day changes nothing (idempotent)
    await syncRentCycles(db, "2026-11-20");
    expect(driver().balance_due).toBe(260);
  });

  it("a week that ends without Paid is logged as Not paid", async () => {
    // Week due 13 Nov never paid; 20 Nov arrives
    const sync = await syncRentCycles(db, "2026-11-20");
    expect(sync.missed).toBe(1);
    expect(tables.rent_week_log).toEqual([
      expect.objectContaining({ due_date: "2026-11-13", status: "missed", amount: 260 }),
    ]);
    expect(driver()).toMatchObject({ rent_status: "unpaid", balance_due: 520 }); // two weeks owed

    const hist = await getRentHistory(db, "d1", "2026-11-20");
    expect(hist.entries.map((e: any) => [e.due_date, e.status])).toEqual([
      ["2026-11-27", "upcoming"],
      ["2026-11-20", "due"],
      ["2026-11-13", "missed"],
    ]);

    // Paid late from the history: the missed week becomes Paid, balance reduced by one week
    const late = await recordRentAction(db, "d1", "paid", {
      dueDate: "2026-11-13",
      today: "2026-11-21",
    });
    expect(late.balance).toBe(260);
    expect(tables.rent_week_log[0].status).toBe("paid");
    expect(late.status).toBe("unpaid"); // the current week (20 Nov) is still unpaid
  });

  it("undo puts the balance back and the week back to Unpaid", async () => {
    await recordRentAction(db, "d1", "paid", { today: "2026-11-13" });
    const undo = await recordRentAction(db, "d1", "unpaid", { today: "2026-11-13" });
    expect(undo).toMatchObject({ ok: true, status: "unpaid", balance: 260 });
    expect(tables.rent_week_log).toHaveLength(0);
  });

  it("uses the old Paid/Unpaid toggle when the rent tables are not set up yet", async () => {
    delete tables.driver_tracks[0].rent_paid_for_due_date;
    const origFrom = db.from;
    (db as any).from = (t: string) =>
      t === "rent_week_log"
        ? {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: null,
                    error: { message: "relation rent_week_log does not exist" },
                  }),
                }),
              }),
            }),
          }
        : origFrom(t);
    const res = await recordRentAction(db, "d1", "paid", { today: "2026-11-13" });
    (db as any).from = origFrom;
    expect(res).toMatchObject({ ok: true, legacy: true, status: "paid", balance: 0 });
  });
});
