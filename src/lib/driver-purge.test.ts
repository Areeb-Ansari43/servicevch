import { describe, expect, it } from "bun:test";
import { purgeCutoff, purgeExpiredDeletedDrivers } from "./driver-purge.server";

type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>) {
  const removed: Record<string, string[]> = {};
  const deletedUsers: string[] = [];
  const from = (t: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "delete" | "insert" = "select";
    let lim = Infinity;
    const b: any = {
      select: () => b,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
      not: (c: string, _o: string, _v: any) => (filters.push((r) => r[c] != null), b),
      lt: (c: string, v: any) => (filters.push((r) => String(r[c]) < String(v)), b),
      limit: (n: number) => ((lim = n), b),
      delete: () => ((op = "delete"), b),
      insert: (row: Row) => ((tables[t] ??= []).push(row), (op = "insert"), b),
      then: (res: any) => {
        const all = tables[t] ?? [];
        if (op === "delete") {
          tables[t] = all.filter((r) => !filters.every((f) => f(r)));
          return res({ data: null, error: null });
        }
        return res({ data: all.filter((r) => filters.every((f) => f(r))).slice(0, lim), error: null });
      },
    };
    return b;
  };
  return {
    db: {
      from,
      storage: { from: (bucket: string) => ({ remove: async (paths: string[]) => ((removed[bucket] = [...(removed[bucket] ?? []), ...paths]), { error: null }) }) },
      auth: { admin: { deleteUser: async (id: string) => (deletedUsers.push(id), { error: null }) } },
    },
    removed,
    deletedUsers,
  };
}

describe("30-day purge of deleted drivers", () => {
  const now = new Date("2026-12-31T12:00:00Z");
  it("cutoff is 30 days back", () => {
    expect(purgeCutoff(now)).toBe("2026-12-01T12:00:00.000Z");
  });

  it("removes drivers deleted over 30 days ago with their files, rows and login; keeps newer ones", async () => {
    const tables: Record<string, Row[]> = {
      driver_tracks: [
        { id: "old", driver_name: "Old", auth_user_id: "u-old", deleted_at: "2026-11-20T10:00:00Z" },
        { id: "recent", driver_name: "Recent", auth_user_id: "u-rec", deleted_at: "2026-12-20T10:00:00Z" },
        { id: "active", driver_name: "Active", auth_user_id: "u-act", deleted_at: null },
      ],
      driver_documents: [{ driver_id: "old", file_path: "old/contract.pdf" }],
      mileage_submissions: [{ driver_id: "old", image_path: "old/1.jpg" }, { driver_id: "recent", image_path: "recent/1.jpg" }],
      mileage_logs: [{ track_id: "old" }],
      deposit_payments: [{ driver_id: "old" }],
      audit_logs: [],
    };
    const f = fakeDb(tables);
    const res = await purgeExpiredDeletedDrivers(f.db as any, now);
    expect(res.purged.map((p) => p.id)).toEqual(["old"]);
    expect(tables.driver_tracks.map((d) => d.id)).toEqual(["recent", "active"]);
    expect(f.removed["driver-documents"]).toEqual(["old/contract.pdf"]);
    expect(f.removed["mileage-photos"]).toEqual(["old/1.jpg"]);
    expect(tables.mileage_submissions.map((r) => r.driver_id)).toEqual(["recent"]);
    expect(tables.mileage_logs).toEqual([]);
    expect(tables.deposit_payments).toEqual([]);
    expect(f.deletedUsers).toEqual(["u-old"]);
    expect(tables.audit_logs[0]).toMatchObject({ action_type: "driver_purged", target_id: "old" });
  });

  it("keeps the portal login if another driver record still uses it", async () => {
    const tables: Record<string, Row[]> = {
      driver_tracks: [
        { id: "old", driver_name: "Old", auth_user_id: "shared", deleted_at: "2026-11-01T00:00:00Z" },
        { id: "new", driver_name: "Same person", auth_user_id: "shared", deleted_at: null },
      ],
    };
    const f = fakeDb(tables);
    await purgeExpiredDeletedDrivers(f.db as any, now);
    expect(f.deletedUsers).toEqual([]);
  });
});
