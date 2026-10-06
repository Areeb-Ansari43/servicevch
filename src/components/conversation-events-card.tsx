import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getConversationEvents, type ConversationEvent } from "@/lib/chat.functions";

export function ConversationEventsCard() {
  const fetchEventsFn = useServerFn(getConversationEvents);
  const [events, setEvents] = useState<ConversationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const res = await fetchEventsFn();
      setEvents(res.events || []);
    } catch (err) {
      console.warn("[ConversationEventsCard] Failed to fetch events:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEvents();
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📜 AI Conversation Events Log</span>
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Audit trail of the last 100 AI responses, provider models, tool calls, and validation results.
          </p>
        </div>
        <button
          type="button"
          onClick={loadEvents}
          disabled={loading}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 transition-all flex items-center gap-1.5"
        >
          {loading ? "Refreshing..." : "↻ Refresh Log"}
        </button>
      </div>

      <div className="mt-4 max-h-96 overflow-y-auto rounded-xl border border-white/5 bg-zinc-950/80 p-2 font-mono text-xs space-y-2">
        {events.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 font-sans text-xs">
            {loading ? "Loading event log..." : "No conversation events logged yet."}
          </div>
        ) : (
          events.map((evt) => (
            <div
              key={evt.id}
              className="p-3 rounded-lg border border-white/5 bg-zinc-900/50 hover:bg-zinc-900/90 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">{evt.chat_id}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-emerald-400 font-mono">
                    {evt.provider} ({evt.model})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span>{evt.latency_ms}ms</span>
                  <span>{new Date(evt.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                </div>
              </div>

              {evt.tool_calls && (
                <div className="mt-1.5 text-zinc-300 text-[10px] bg-zinc-950/60 p-2 rounded border border-white/5">
                  <span className="text-amber-400 font-bold">Tool Calls:</span> {evt.tool_calls}
                </div>
              )}

              {evt.error && (
                <div className="mt-1.5 text-red-400 text-[10px] bg-red-950/20 p-2 rounded border border-red-500/20">
                  <span className="text-red-500 font-bold">Error:</span> {evt.error}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
