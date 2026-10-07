import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortalAuthEvent {
  id: string;
  created_at: string;
  hashed_email: string;
  step: string;
  result_code: string;
  reason: string | null;
}

export function PortalAuthEventsAdminCard({
  toast,
}: {
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [events, setEvents] = useState<PortalAuthEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("portal_auth_events" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.warn("[PortalAuthEventsAdminCard] Query warning:", error.message);
        toast(`Failed to load auth events: ${error.message}`, "error");
        setEvents([]);
      } else {
        setEvents((data as any) || []);
      }
    } catch (err: any) {
      console.error("[PortalAuthEventsAdminCard] Exception loading auth events:", err);
      toast(err?.message || "Failed to load portal auth events", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const resultCodeBadge = (code: string) => {
    let colorCls = "border-zinc-500/30 bg-zinc-500/10 text-zinc-300";
    if (code === "SUCCESS") {
      colorCls = "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    } else if (code.includes("RATE_LIMITED") || code.includes("EXPIRED") || code.includes("INVALID")) {
      colorCls = "border-amber-500/40 bg-amber-500/15 text-amber-300";
    } else if (code.includes("DISABLED") || code.includes("SYSTEM_ERROR") || code.includes("UNAUTHORIZED")) {
      colorCls = "border-red-500/40 bg-red-500/15 text-red-300";
    }

    return (
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${colorCls}`}>
        {code}
      </span>
    );
  };

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ borderColor: "var(--vch-border)", background: "var(--vch-surface)" }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3" style={{ borderColor: "var(--vch-border-soft)" }}>
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#ff6a00]/20 text-[#ff8a3d] font-bold text-xs">🔐</span>
            <h2 className="text-base font-bold text-white">Portal 2FA & Auth Security Events Log</h2>
          </div>
          <p className="mt-0.5 text-xs text-[#9aa5b8]">
            Displays the last 50 driver portal 2FA authentication requests and verifications. Emails are SHA-256 hashed and codes are never stored.
          </p>
        </div>

        <button
          type="button"
          onClick={loadEvents}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors shrink-0"
          style={{ borderColor: "var(--vch-border-soft)" }}
        >
          <span className={loading ? "animate-spin" : ""}>🔄</span>
          Refresh Events
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs text-[#8b95a8]">Loading auth security events...</div>
      ) : events.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#8b95a8]">No portal auth events recorded yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--vch-border-soft)" }}>
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-black/30 text-[10px] font-bold uppercase tracking-wider text-[#8b95a8]" style={{ borderColor: "var(--vch-border-soft)" }}>
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Hashed Email (SHA-256)</th>
                <th className="px-4 py-3">Step</th>
                <th className="px-4 py-3">Result Code</th>
                <th className="px-4 py-3">Reason / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {events.map((ev) => (
                <tr key={ev.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-[#aeb8c9] whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[#ff8a3d] truncate max-w-[180px]" title={ev.hashed_email}>
                    {ev.hashed_email ? `${ev.hashed_email.slice(0, 12)}...` : "—"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-white capitalize">
                    {ev.step ? ev.step.replace("_", " ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {resultCodeBadge(ev.result_code || "UNKNOWN")}
                  </td>
                  <td className="px-4 py-3 text-[#c8d0dd] max-w-[280px] truncate" title={ev.reason || ""}>
                    {ev.reason || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
