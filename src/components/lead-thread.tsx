import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLeadConversation, sendHumanReply, setLeadAiMode } from "@/lib/chat.functions";

export type ThreadMessage = {
  id: string;
  sender: string;
  content: string;
  media_url: string | null;
  handoff: boolean;
  created_at: string;
};

const AI_FALLBACK_TEXT = "I’m sorry, I’m having trouble helping with that right now. I’m connecting you with a member of our team now.";

const SENDER_STYLES: Record<string, { label: string; className: string }> = {
  customer: { label: "Customer", className: "border border-white/10 bg-white/[0.05] text-[#dce3ee]" },
  ai_agent: { label: "AI Agent", className: "ml-auto border border-[#ff6a00]/30 bg-[#ff6a00]/12 text-[#ffd9bd]" },
  human: { label: "You (human)", className: "ml-auto bg-[#ff6a00] text-white" },
};

export function LeadThread({
  leadId,
  contactName,
  aiPaused,
  onClose,
  onChanged,
  toast,
}: {
  leadId: string;
  contactName: string;
  aiPaused: boolean;
  onClose: () => void;
  onChanged: () => void;
  toast: (m: string, t?: "success" | "error" | "info") => void;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadConversation = useServerFn(getLeadConversation);
  const send = useServerFn(sendHumanReply);
  const setMode = useServerFn(setLeadAiMode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadConversation({ data: { leadId } });
      setMessages(result.messages as ThreadMessage[]);
    } catch (error) {
      setMessages([]);
      toast((error as Error).message || "Could not load conversation history", "error");
    } finally {
      setLoading(false);
    }
  }, [leadId, loadConversation, toast]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Live sync — new messages land in the thread as they arrive.
  useEffect(() => {
    const channel = supabase
      .channel(`lead-thread-${leadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `lead_id=eq.${leadId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leadId, load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = reply.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      const res = await send({ data: { leadId, content } });
      setReply("");
      toast(res.outbound.routed ? "Reply sent — AI paused for this lead" : "Reply saved — AI paused (no outbound channel configured)", "success");
      await load();
      onChanged();
    } catch (err) {
      toast((err as Error).message || "Failed to send reply", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleAi = async () => {
    setBusy(true);
    try {
      await setMode({ data: { leadId, paused: !aiPaused } });
      toast(aiPaused ? "AI auto-replies resumed" : "AI paused — you're handling this lead", "info");
      onChanged();
    } catch (err) {
      toast((err as Error).message || "Failed to update mode", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md sm:p-6" onClick={onClose}>
      <div
        className="flex h-[88vh] max-h-[900px] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-white/15 bg-white/[0.08] shadow-[0_24px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-5 py-4 sm:px-7">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{contactName}</div>
            <div className="text-[11px] text-[#8b95a8]">
              {aiPaused ? "Human handling · AI auto-replies paused" : "AI auto-replies active"}
            </div>
          </div>
          <button
            onClick={toggleAi}
            disabled={busy}
            className={`ml-auto rounded-full border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
              aiPaused
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-200"
            }`}
          >
            {aiPaused ? "Switch back to AI" : "Take over (pause AI)"}
          </button>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-xs text-[#8b95a8] hover:bg-white/10 hover:text-white">Close</button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-7">
          {loading ? (
            <p className="text-xs text-[#8b95a8]">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-[#8b95a8]">No messages logged for this lead yet.</p>
          ) : (
            messages.map((m) => {
              const effectiveSender = m.content.trim() === AI_FALLBACK_TEXT ? "ai_agent" : m.sender;
              const style = SENDER_STYLES[effectiveSender] ?? SENDER_STYLES.customer;
              return (
                <div key={m.id} className={`max-w-[88%] rounded-2xl px-4 py-2.5 ${style.className}`}>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
                    {style.label} · {new Date(m.created_at).toLocaleString("en-GB")}
                    {m.handoff ? " · handoff" : ""}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                  {m.media_url && <img src={m.media_url} alt="Attachment" className="mt-2 max-h-48 rounded-lg" loading="lazy" />}
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/10 bg-white/[0.04] px-5 py-4 sm:px-7">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply as a human agent…"
            className="flex-1 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !reply.trim()}
            className="rounded-full bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
