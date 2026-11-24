import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarCheck, CalendarX, ChevronDown } from "lucide-react";
import { getRentHistoryFn } from "@/lib/rent.functions";

type Entry = {
  due_date: string;
  status: "paid" | "missed" | "due" | "upcoming";
  amount: number;
  recorded_at: string | null;
};

const day = (d: string) =>
  new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** "Rent logged" dropdown: each rent week and the day it was paid (or that it wasn't). */
export function RentLoggedList({
  driverId,
  refreshKey,
}: {
  driverId: string;
  refreshKey?: string;
}) {
  const history = useServerFn(getRentHistoryFn);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = (await history({ data: { driverId } })) as {
          ok: boolean;
          entries: Entry[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) setNote(res.error || "Rent log not available");
        setEntries((res.entries || []).filter((e) => e.status === "paid" || e.status === "missed"));
      } catch {
        if (!cancelled) setNote("Rent log not available right now");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driverId, refreshKey, history]);

  const paid = entries?.filter((e) => e.status === "paid").length ?? 0;
  const missed = entries?.filter((e) => e.status === "missed").length ?? 0;

  return (
    <details className="group rounded-lg border border-white/10 bg-black/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-semibold text-white">
        <span className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-[#ff8a3d]" /> Rent logged
          {entries && (
            <span className="font-normal text-[#8b95a8]">
              {paid} paid{missed ? ` · ${missed} not paid` : ""}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-[#8b95a8] transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/10 px-3 py-2">
        {entries === null && !note ? (
          <div className="vch-skeleton h-10 rounded-md" />
        ) : note && !entries?.length ? (
          <p className="py-1 text-[11px] text-[#8b95a8]">{note}</p>
        ) : entries && entries.length === 0 ? (
          <p className="py-1 text-[11px] text-[#8b95a8]">No rent weeks logged yet.</p>
        ) : (
          <ul className="max-h-56 divide-y divide-white/5 overflow-y-auto">
            {entries!.map((e) => (
              <li
                key={e.due_date}
                className="flex items-center justify-between gap-3 py-2 text-[11px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {e.status === "paid" ? (
                    <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <CalendarX className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-semibold text-white">
                      Week due {day(e.due_date)}
                    </span>
                    <span className="text-[#8b95a8]">
                      {e.status === "paid"
                        ? e.recorded_at
                          ? e.recorded_at.slice(0, 10) > e.due_date
                            ? `Paid on ${day(e.recorded_at)}`
                            : e.recorded_at.slice(0, 10) < e.due_date
                              ? `Paid in advance on ${day(e.recorded_at)}`
                              : `Paid on ${day(e.recorded_at)}`
                          : "Paid"
                        : "Not paid"}
                    </span>
                  </span>
                </span>
                <span
                  className={`shrink-0 font-bold ${e.status === "paid" ? "text-emerald-300" : "text-red-300"}`}
                >
                  £{Number(e.amount).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
