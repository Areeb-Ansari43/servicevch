import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getRentHistoryFn } from "@/lib/rent.functions";

type Entry = {
  due_date: string;
  status: "paid" | "missed" | "due" | "upcoming";
  amount: number;
  recorded_at: string | null;
  recorded_by: string | null;
};

type Toast = (m: string, t?: "success" | "error" | "info") => void;

const fmt = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/**
 * Week-by-week rent log for one driver: Paid (with when / by whom), Not paid (week ended
 * without payment), Due now, Upcoming. Missed weeks can be marked paid late.
 */
export function RentHistoryCard({
  driverId,
  weeklyRent,
  setRentWeekPaid,
  toast,
  refreshKey,
}: {
  driverId: string;
  weeklyRent: number;
  setRentWeekPaid: (driverId: string, dueDate: string, paid: boolean) => Promise<unknown>;
  toast: Toast;
  refreshKey?: unknown;
}) {
  const historyFn = useServerFn(getRentHistoryFn);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await historyFn({ data: { driverId } });
      if (!res.ok) {
        setError(res.error || "Could not load rent history");
        setEntries([]);
      } else {
        setError(null);
        setEntries(res.entries || []);
      }
    } catch (err: any) {
      setError(err?.message || "Could not load rent history");
    } finally {
      setLoading(false);
    }
  }, [driverId, historyFn]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const toggle = async (e: Entry, paid: boolean) => {
    setBusy(e.due_date);
    try {
      await setRentWeekPaid(driverId, e.due_date, paid);
      toast(
        paid ? `Week of ${fmt(e.due_date)} marked paid` : `Payment for ${fmt(e.due_date)} undone`,
      );
      await load();
    } catch (err: any) {
      toast(err?.message || "Failed to update rent week", "error");
    } finally {
      setBusy(null);
    }
  };

  const paidCount = entries.filter((e) => e.status === "paid").length;
  const missedCount = entries.filter((e) => e.status === "missed").length;

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4" data-rent-history>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-white">Rent history</div>
          <div className="text-[11px] text-[#8b95a8]">
            £{weeklyRent || 0}/week · {paidCount} paid · {missedCount} not paid
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="mt-3 text-xs text-[#8b95a8]">Loading…</div>
      ) : error ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
          {error}
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-3 text-xs text-[#8b95a8]">
          No rent weeks yet. Set a weekly rent and rent due day.
        </div>
      ) : (
        <ul className="mt-3 max-h-64 divide-y divide-white/5 overflow-y-auto text-xs">
          {entries.map((e) => (
            <li
              key={e.due_date}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              data-rent-week={e.status}
            >
              <div>
                <div className="font-semibold text-white">Week due {fmt(e.due_date)}</div>
                <div className="text-[11px] text-[#8b95a8]">
                  £{e.amount}
                  {e.status === "paid" && e.recorded_at
                    ? ` · paid ${new Date(e.recorded_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${e.recorded_by && e.recorded_by !== "backfill" ? ` by ${e.recorded_by}` : ""}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {e.status === "paid" && (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Paid
                  </span>
                )}
                {e.status === "missed" && (
                  <span className="rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                    Not paid
                  </span>
                )}
                {e.status === "due" && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    Due now
                  </span>
                )}
                {e.status === "upcoming" && (
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-[#aeb8c9]">
                    Upcoming
                  </span>
                )}
                {e.status === "paid" ? (
                  <button
                    type="button"
                    disabled={busy === e.due_date}
                    onClick={() => void toggle(e, false)}
                    className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-[#aeb8c9] hover:bg-white/10 disabled:opacity-50"
                  >
                    Undo
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === e.due_date}
                    onClick={() => void toggle(e, true)}
                    className="rounded-md border border-emerald-500/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
                  >
                    Mark paid
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
