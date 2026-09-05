import React, { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLeadConversation, sendHumanReply, setLeadAiMode } from "@/lib/chat.functions";

export type ThreadMessage = {
  id: string;
  sender: string;
  content: string;
  media_url: string | null;
  media_type?: string | null;
  media_mime_type?: string | null;
  handoff: boolean;
  created_at: string;
  status?: string | null;
  meta_message_id?: string | null;
};

const AI_FALLBACK_TEXT =
  "Handoff needed.\n\nOur team will get back to you within 24 hours. Please do not contact this number — we will contact you first.";

function formatMessageTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function ReadReceipt({ status }: { status?: string | null }) {
  if (status === "read") {
    return (
      <span
        className="ml-1 inline-flex items-center text-[12px] font-bold leading-none text-[#53bdeb]"
        title="Read"
      >
        ✓✓
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span
        className="ml-1 inline-flex items-center text-[12px] font-bold leading-none text-[#8696a0]"
        title="Delivered"
      >
        ✓✓
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span
        className="ml-1 inline-flex items-center text-[12px] font-bold leading-none text-[#8696a0]"
        title="Sent"
      >
        ✓
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="ml-1 inline-flex items-center text-[11px] font-bold leading-none text-red-400"
        title="Delivery failed"
      >
        !
      </span>
    );
  }
  return (
    <span
      className="ml-1 inline-flex items-center text-[10px] italic leading-none text-[#8696a0]/70"
      title="Status unmonitored for this message"
    >
      (unmonitored)
    </span>
  );
}

// Subcomponent for the reply input to isolate keystroke re-renders
const ReplyForm = React.memo(function ReplyForm({
  onSend,
  busy,
}: {
  onSend: (text: string) => Promise<void>;
  busy: boolean;
}) {
  const [reply, setReply] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = reply.trim();
    if (!content || busy) return;
    setReply("");
    await onSend(content);
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 border-t border-[#222d34] bg-[#111b21] px-4 py-3 sm:px-6"
    >
      <input
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Type a message as human agent…"
        className="flex-1 rounded-lg border border-[#2a3942] bg-[#202c33] px-4 py-2.5 text-sm text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !reply.trim()}
        className="rounded-lg bg-[#00a884] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#008f6f] disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
});

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
  const [busy, setBusy] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const prevLeadIdRef = useRef(leadId);

  const loadConversation = useServerFn(getLeadConversation);
  const send = useServerFn(sendHumanReply);
  const setMode = useServerFn(setLeadAiMode);

  // Check if scroll container is near the bottom
  const isNearBottom = useCallback(() => {
    if (!scrollRef.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollHeight - scrollTop - clientHeight < 120;
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const result = await loadConversation({ data: { leadId } });
        const fetchedMessages = result.messages as ThreadMessage[];

        const shouldScroll = isInitialLoadRef.current || isNearBottom();

        setMessages(fetchedMessages);

        if (shouldScroll) {
          requestAnimationFrame(() => {
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            }
          });
        }
        isInitialLoadRef.current = false;
      } catch (error) {
        if (!silent) setMessages([]);
        toast((error as Error).message || "Could not load conversation history", "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [leadId, loadConversation, toast, isNearBottom],
  );

  // Handle leadId change
  useEffect(() => {
    if (prevLeadIdRef.current !== leadId) {
      prevLeadIdRef.current = leadId;
      isInitialLoadRef.current = true;
      setLoading(true);
    }
    load(false);
  }, [leadId, load]);

  // Live sync — new messages land in the thread as they arrive without unmounting
  useEffect(() => {
    const channel = supabase
      .channel(`lead-thread-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `lead_id=eq.${leadId}` },
        () => load(true),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId, load]);

  const handleSend = async (content: string) => {
    setBusy(true);
    try {
      const res = await send({ data: { leadId, content } });
      toast(
        res.outbound.routed
          ? "Reply sent — AI paused for this lead"
          : "Reply saved — AI paused (no outbound channel configured)",
        "success",
      );
      // Silent refresh so chat doesn't unmount or jump
      await load(true);
      // Force scroll to bottom when user sends a reply
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
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
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[90vh] max-h-[900px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#222d34] bg-[#0b141a] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* WhatsApp Header */}
        <div className="flex items-center gap-3 border-b border-[#222d34] bg-[#111b21] px-4 py-3 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884]/20 text-[#00a884] font-bold text-sm">
            {contactName ? contactName[0].toUpperCase() : "W"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[#e9edef]">{contactName}</div>
            <div className="text-[11px] text-[#8696a0]">
              {aiPaused ? "Human handling · AI auto-replies paused" : "AI auto-replies active"}
            </div>
          </div>
          <button
            onClick={toggleAi}
            disabled={busy}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50 ${
              aiPaused
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-200"
            }`}
          >
            {aiPaused ? "Switch back to AI" : "Take over (pause AI)"}
          </button>
          <button
            onClick={onClose}
            className="rounded-full px-2.5 py-1 text-xs text-[#8696a0] hover:bg-white/10 hover:text-[#e9edef]"
          >
            Close
          </button>
        </div>

        {/* WhatsApp Chat Messages Container */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6"
          style={{
            backgroundImage:
              "radial-gradient(circle at center, rgba(255,255,255,0.015) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          {loading ? (
            <p className="text-xs text-[#8696a0]">Loading conversation…</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-[#8696a0]">No messages logged for this lead yet.</p>
          ) : (
            messages.map((m) => {
              const effectiveSender =
                m.content.trim() === AI_FALLBACK_TEXT ? "ai_agent" : m.sender;
              const isOutgoing = effectiveSender === "ai_agent" || effectiveSender === "human" || effectiveSender === "user";

              const senderLabel =
                effectiveSender === "ai_agent"
                  ? "AI Agent"
                  : effectiveSender === "human"
                    ? "You (human)"
                    : "Customer";

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}
                >
                  <div
                    className={`relative max-w-[85%] px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm sm:max-w-[75%] ${
                      isOutgoing
                        ? "rounded-2xl rounded-tr-xs bg-[#005c4b] text-[#e9edef]"
                        : "rounded-2xl rounded-tl-xs bg-[#202c33] text-[#e9edef]"
                    }`}
                  >
                    {/* Header line showing sender label */}
                    <div className="mb-0.5 text-[10px] font-bold tracking-wider opacity-80">
                      {isOutgoing ? (
                        <span className="text-[#d1f4cc]">{senderLabel}</span>
                      ) : (
                        <span className="text-[#25d366]">{senderLabel}</span>
                      )}
                      {m.handoff ? " · handoff" : ""}
                    </div>

                    {/* Message content */}
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>

                    {/* Media Attachments */}
                    {m.media_url && (
                      <div className="mt-2">
                        {(m.media_type ?? "").toLowerCase() === "video" ? (
                          <video
                            src={m.media_url}
                            controls
                            className="max-h-52 max-w-full rounded-lg"
                            preload="metadata"
                          />
                        ) : (m.media_type ?? "").toLowerCase() === "audio" ? (
                          <audio
                            src={m.media_url}
                            controls
                            className="max-w-full"
                            preload="metadata"
                          />
                        ) : (m.media_type ?? "").toLowerCase() === "image" ||
                          (m.media_mime_type ?? "").startsWith("image/") ? (
                          <button
                            type="button"
                            onClick={() => setPreviewImage(m.media_url)}
                            className="block max-w-full cursor-zoom-in rounded-lg text-left focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                            aria-label="View image full screen"
                          >
                            <img
                              src={m.media_url}
                              alt="WhatsApp attachment — click to view full screen"
                              className="max-h-48 max-w-full rounded-lg object-contain transition hover:brightness-110"
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <a
                            href={m.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-full border border-white/20 px-3 py-1 text-xs text-[#d1f4cc] hover:bg-white/10"
                          >
                            Open WhatsApp attachment
                          </a>
                        )}
                      </div>
                    )}

                    {/* Timestamp & Read Receipt Checkmarks */}
                    <div className="mt-1 flex items-center justify-end gap-0.5 text-[10px] text-[#8696a0]">
                      <span>{formatMessageTime(m.created_at)}</span>
                      {isOutgoing && <ReadReceipt status={m.status} />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* WhatsApp Reply Form */}
        <ReplyForm onSend={handleSend} busy={busy} />
      </div>

      {/* Image Full-screen Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen WhatsApp image"
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-5 top-5 rounded-full border border-white/20 bg-black/50 px-3.5 py-1.5 text-xs text-white hover:bg-white/20"
            aria-label="Close full-screen image"
          >
            Close
          </button>
          <img
            src={previewImage}
            alt="WhatsApp attachment full screen"
            className="max-h-[92vh] max-w-[96vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
