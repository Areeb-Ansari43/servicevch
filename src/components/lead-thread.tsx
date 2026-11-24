import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: today.getFullYear() === d.getFullYear() ? undefined : "numeric" });
}

/** Three bouncing dots, like WhatsApp's "typing…". */
export function TypingDots({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      <span className="vch-typing-dot h-2 w-2 rounded-full bg-[#8696a0]" />
      <span className="vch-typing-dot h-2 w-2 rounded-full bg-[#8696a0] [animation-delay:0.15s]" />
      <span className="vch-typing-dot h-2 w-2 rounded-full bg-[#8696a0] [animation-delay:0.3s]" />
    </span>
  );
}

/**
 * Is the AI likely writing a reply right now? Uses the live ai_status when the database has it;
 * otherwise: the last message is from the customer, it arrived in the last 45 seconds and the AI
 * isn't paused.
 */
export function aiLikelyTyping(
  messages: { sender: string; created_at: string }[],
  aiPaused: boolean,
  aiStatus: string | null,
  now = Date.now(),
): boolean {
  if (aiPaused) return false;
  if (aiStatus === "typing") return true;
  if (aiStatus && aiStatus !== "typing") return false;
  const last = messages[messages.length - 1];
  if (!last || last.sender !== "customer") return false;
  const age = now - new Date(last.created_at).getTime();
  return age >= 0 && age < 45_000;
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
  return null;
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

  const taRef = useRef<HTMLTextAreaElement>(null);
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const content = reply.trim();
    if (!content || busy) return;
    setReply("");
    if (taRef.current) taRef.current.style.height = "";
    await onSend(content);
  };

  return (
    <form
      onSubmit={submit}
      className="flex items-end gap-2 border-t border-[#222d34] bg-[#111b21] px-3 py-3 sm:px-5"
    >
      <textarea
        ref={taRef}
        rows={1}
        value={reply}
        onChange={(e) => {
          setReply(e.target.value);
          e.target.style.height = "";
          e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Type a reply… (Enter to send, Shift+Enter for a new line)"
        aria-label="Reply message"
        className="max-h-36 min-h-[44px] flex-1 resize-none rounded-3xl border border-[#2a3942] bg-[#202c33] px-4 py-2.5 text-sm leading-6 text-[#e9edef] placeholder:text-[#8696a0] focus:border-[#00a884] focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !reply.trim()}
        aria-label="Send reply"
        className="vch-press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00a884] text-white transition hover:bg-[#008f6f] disabled:opacity-40"
      >
        {busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
          </svg>
        )}
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
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [pending, setPending] = useState<ThreadMessage[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [, setTick] = useState(0);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const toastRef = useRef(toast);
  toastRef.current = toast;

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

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    });
    setUnseen(0);
  }, []);

  const loadingRef = useRef(false);
  const load = useCallback(
    async (silent = false) => {
      if (silent && loadingRef.current) return; // a poll is already in flight
      loadingRef.current = true;
      if (!silent) setLoading(true);
      try {
        const result = await loadConversation({ data: { leadId } });
        const fetchedMessages = result.messages as ThreadMessage[];
        const first = isInitialLoadRef.current;
        const nearBottom = isNearBottom();

        // Which messages are new since the last load (they get the pop-in animation).
        const seen = seenIdsRef.current;
        const added = fetchedMessages.filter((m) => !seen.has(m.id));
        fetchedMessages.forEach((m) => seen.add(m.id));

        setMessages((prev) => {
          if (
            prev.length === fetchedMessages.length &&
            prev.every((m, i) => m.id === fetchedMessages[i].id && m.status === fetchedMessages[i].status)
          )
            return prev; // nothing changed: no re-render
          return fetchedMessages;
        });
        if (added.length) {
          // Drop optimistic bubbles once the real message has arrived.
          setPending((p) => p.filter((x) => !added.some((a) => a.sender === "human" && a.content.trim() === x.content.trim())));
          if (!first) {
            setFreshIds(new Set(added.map((m) => m.id)));
            if (!nearBottom) setUnseen((n) => n + added.length);
          }
        }
        if (first || (added.length && nearBottom)) scrollToBottom(!first);
        isInitialLoadRef.current = false;
      } catch (error) {
        if (!silent) {
          setMessages([]);
          toastRef.current((error as Error).message || "Could not load conversation history", "error");
        }
      } finally {
        loadingRef.current = false;
        if (!silent) setLoading(false);
      }
    },
    [leadId, loadConversation, isNearBottom, scrollToBottom],
  );

  // Handle leadId change
  useEffect(() => {
    if (prevLeadIdRef.current !== leadId) {
      prevLeadIdRef.current = leadId;
      isInitialLoadRef.current = true;
      seenIdsRef.current = new Set();
      setPending([]);
      setUnseen(0);
      setLoading(true);
    }
    load(false);
  }, [leadId, load]);

  // Live sync & Realtime typing status with connection status and polling fallback
  useEffect(() => {
    const channel = supabase
      .channel(`lead-thread-${leadId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `lead_id=eq.${leadId}` },
        () => load(true),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_leads", filter: `id=eq.${leadId}` },
        (payload: any) => {
          if (payload.new && typeof payload.new.ai_status !== "undefined") {
            setAiStatus(payload.new.ai_status);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setIsLive(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setIsLive(false);
        }
      });

    // Polling fallback: every 2.5s while the tab is visible (realtime may not be enabled for
    // the messages table), and straight away when the tab comes back into view.
    const poll = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void load(true);
      setTick((t) => t + 1); // re-evaluates the typing indicator's 45s window
    };
    const interval = setInterval(poll, 2500);
    const onVisible = () => document.visibilityState === "visible" && void load(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      supabase.removeChannel(channel);
    };
  }, [leadId, load]);

  const handleSend = async (content: string) => {
    setBusy(true);
    const temp: ThreadMessage = {
      id: `pending-${Date.now()}`,
      sender: "human",
      content,
      media_url: null,
      handoff: false,
      created_at: new Date().toISOString(),
      status: "sending",
    };
    setPending((p) => [...p, temp]);
    scrollToBottom(true);
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
      setPending((p) => p.map((x) => (x.id === temp.id ? { ...x, status: "failed" } : x)));
      toast((err as Error).message || "Failed to send reply", "error");
    } finally {
      setBusy(false);
    }
  };

  const shown = pending.length ? [...messages, ...pending] : messages;
  const typing = !loading && aiLikelyTyping(messages, aiPaused, aiStatus);

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

  const view = (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-6"
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
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-[#e9edef]">{contactName}</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  isLive
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                }`}
                title={isLive ? "New messages appear instantly" : "Checking for new messages every few seconds"}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                {isLive ? "Live" : "Auto-refresh"}
              </span>
            </div>
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
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={() => unseen && isNearBottom() && setUnseen(0)}
          className="flex-1 overflow-y-auto px-3 py-4 sm:px-6"
          aria-live="polite"
          style={{
            backgroundImage:
              "radial-gradient(circle at center, rgba(255,255,255,0.02) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          {loading ? (
            <div className="space-y-3">
              {[60, 40, 70, 50].map((w, i) => (
                <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                  <div className="vch-skeleton h-12 rounded-2xl" style={{ width: `${w}%` }} />
                </div>
              ))}
            </div>
          ) : shown.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <p className="rounded-full bg-[#182229] px-4 py-2 text-xs text-[#8696a0]">
                No messages for this lead yet. New messages appear here automatically.
              </p>
            </div>
          ) : (
            shown.map((m, i) => {
              const prev = shown[i - 1];
              const effectiveSender =
                m.content.trim() === AI_FALLBACK_TEXT ? "ai_agent" : m.sender;
              const prevSender = prev
                ? prev.content.trim() === AI_FALLBACK_TEXT
                  ? "ai_agent"
                  : prev.sender
                : null;
              const isOutgoing = effectiveSender === "ai_agent" || effectiveSender === "human" || effectiveSender === "user";
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const grouped =
                !newDay &&
                prevSender === effectiveSender &&
                new Date(m.created_at).getTime() - new Date(prev!.created_at).getTime() < 5 * 60_000;
              const senderLabel =
                effectiveSender === "ai_agent"
                  ? "AI Agent"
                  : effectiveSender === "human"
                    ? "You"
                    : contactName || "Customer";
              const fresh = freshIds.has(m.id) || m.id.startsWith("pending-");

              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="sticky top-0 z-[1] my-3 flex justify-center">
                      <span className="rounded-lg bg-[#182229]/95 px-3 py-1 text-[11px] font-medium text-[#8696a0] shadow">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div
                    className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"} ${grouped ? "mt-0.5" : "mt-3"} ${fresh ? "vch-msg-in" : ""}`}
                  >
                    <div
                      className={`relative max-w-[85%] px-3 py-1.5 text-[14px] leading-relaxed shadow-sm sm:max-w-[70%] ${
                        isOutgoing
                          ? `rounded-2xl ${grouped ? "" : "rounded-tr-md"} ${effectiveSender === "ai_agent" ? "bg-[#0a4a3e]" : "bg-[#005c4b]"} text-[#e9edef]`
                          : `rounded-2xl ${grouped ? "" : "rounded-tl-md"} bg-[#202c33] text-[#e9edef]`
                      } ${m.status === "failed" ? "ring-1 ring-red-400/60" : ""} ${m.status === "sending" ? "opacity-70" : ""}`}
                    >
                      {!grouped && (
                        <div className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold">
                          {effectiveSender === "ai_agent" ? (
                            <span className="rounded bg-[#00a884]/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#25d366]">
                              AI
                            </span>
                          ) : null}
                          <span className={isOutgoing ? "text-[#d1f4cc]" : "text-[#53bdeb]"}>{senderLabel}</span>
                          {m.handoff ? <span className="text-amber-300">· handoff</span> : null}
                        </div>
                      )}

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
                      <div className="mt-0.5 flex items-center justify-end gap-0.5 text-[10px] text-[#8696a0]">
                        <span>
                          {m.status === "sending"
                            ? "Sending…"
                            : m.status === "failed"
                              ? "Not sent"
                              : formatMessageTime(m.created_at)}
                        </span>
                        {isOutgoing && m.status !== "sending" && <ReadReceipt status={m.status} />}
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}

          {/* Typing indicator: the AI is writing a reply */}
          {typing && (
            <div className="vch-msg-in mt-3 flex items-end gap-2" aria-label="AI is typing">
              <div className="rounded-2xl rounded-tl-md bg-[#202c33] px-4 py-3 shadow-sm">
                <TypingDots />
              </div>
              <span className="pb-1 text-[11px] text-[#8696a0]">AI is typing…</span>
            </div>
          )}
        </div>

        {unseen > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="vch-pop pointer-events-auto rounded-full bg-[#00a884] px-4 py-1.5 text-xs font-bold text-white shadow-lg"
            >
              {unseen} new message{unseen === 1 ? "" : "s"} ↓
            </button>
          </div>
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
  // Rendered at the top of the page so the sidebar and page layers can't sit on top of it.
  return typeof document !== "undefined" ? createPortal(view, document.body) : view;
}
