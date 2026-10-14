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

  // Compute average duration per stage across last 50 events
  const last50 = events.slice(0, 50);

  let msgSaveSum = 0, msgSaveCount = 0;
  let aiStartSum = 0, aiStartCount = 0;
  let providerSum = 0, providerCount = 0;
  let replySum = 0, replyCount = 0;
  let crmSum = 0, crmCount = 0;
  let totalSum = 0, totalCount = 0;

  last50.forEach((e) => {
    const recv = e.webhook_received_at ? new Date(e.webhook_received_at).getTime() : null;
    const saved = e.message_saved_at ? new Date(e.message_saved_at).getTime() : null;
    const aiStart = e.ai_started_at ? new Date(e.ai_started_at).getTime() : null;
    const providerRes = e.first_provider_response_at ? new Date(e.first_provider_response_at).getTime() : null;
    const replySent = e.reply_sent_at ? new Date(e.reply_sent_at).getTime() : null;
    const crmVis = e.crm_visible_at ? new Date(e.crm_visible_at).getTime() : null;

    if (recv && saved && saved >= recv) { msgSaveSum += (saved - recv); msgSaveCount++; }
    if (saved && aiStart && aiStart >= saved) { aiStartSum += (aiStart - saved); aiStartCount++; }
    if (aiStart && providerRes && providerRes >= aiStart) { providerSum += (providerRes - aiStart); providerCount++; }
    if (providerRes && replySent && replySent >= providerRes) { replySum += (replySent - providerRes); replyCount++; }
    if (replySent && crmVis && crmVis >= replySent) { crmSum += (crmVis - replySent); crmCount++; }
    if (recv && crmVis && crmVis >= recv) { totalSum += (crmVis - recv); totalCount++; }
  });

  const avgMsgSave = msgSaveCount ? Math.round(msgSaveSum / msgSaveCount) : 0;
  const avgAiStart = aiStartCount ? Math.round(aiStartSum / aiStartCount) : 0;
  const avgProvider = providerCount ? Math.round(providerSum / providerCount) : 0;
  const avgReply = replyCount ? Math.round(replySum / replyCount) : 0;
  const avgCrm = crmCount ? Math.round(crmSum / crmCount) : 0;
  const avgTotal = totalCount ? Math.round(totalSum / totalCount) : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-xl backdrop-blur-md space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>📜 AI Conversation Events & Stage Timing</span>
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Audit trail and stage duration breakdown across the last 50 inbound WhatsApp AI executions.
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

      {/* STAGE TIMING BREAKDOWN SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 bg-zinc-950/80 p-3 rounded-xl border border-white/5 text-xs text-zinc-300">
        <div className="p-2 bg-zinc-900/50 rounded border border-white/5">
          <div className="text-[10px] text-zinc-400 uppercase">1. Save Msg</div>
          <div className="text-sm font-bold text-emerald-400">{avgMsgSave} ms</div>
        </div>
        <div className="p-2 bg-zinc-900/50 rounded border border-white/5">
          <div className="text-[10px] text-zinc-400 uppercase">2. AI Init</div>
          <div className="text-sm font-bold text-emerald-400">{avgAiStart} ms</div>
        </div>
        <div className="p-2 bg-zinc-900/50 rounded border border-white/5">
          <div className="text-[10px] text-zinc-400 uppercase">3. AI Reply</div>
          <div className="text-sm font-bold text-amber-400">{avgProvider} ms</div>
        </div>
        <div className="p-2 bg-zinc-900/50 rounded border border-white/5">
          <div className="text-[10px] text-zinc-400 uppercase">4. Reply Dispatch</div>
          <div className="text-sm font-bold text-emerald-400">{avgReply} ms</div>
        </div>
        <div className="p-2 bg-zinc-900/50 rounded border border-white/5">
          <div className="text-[10px] text-zinc-400 uppercase">5. CRM Visible</div>
          <div className="text-sm font-bold text-emerald-400">{avgCrm} ms</div>
        </div>
        <div className="p-2 bg-emerald-950/40 rounded border border-emerald-500/20">
          <div className="text-[10px] text-emerald-300 font-bold uppercase">Avg Total Pipeline</div>
          <div className="text-sm font-extrabold text-emerald-300">{avgTotal > 0 ? `${(avgTotal / 1000).toFixed(2)}s` : "Pending Data"}</div>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-white/5 bg-zinc-950/80 p-2 font-mono text-xs space-y-2">
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
