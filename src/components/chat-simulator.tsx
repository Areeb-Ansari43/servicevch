import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Entry = {
  id: string;
  direction: "sent" | "received" | "system";
  text: string;
  mediaUrl?: string | null;
};

const OPTIONS = [
  { key: "1", label: "[1] Rent a Car" },
  { key: "2", label: "[2] Report an Accident" },
  { key: "3", label: "[3] Speak to Human" },
];

const uid = () => Math.random().toString(36).slice(2);
const SESSION_STORAGE_KEY = "servicevch.test-chat.session.v1";

function getSimulatorSessionId(): string {
  if (typeof window === "undefined") return `sim-${uid()}-${Date.now()}`;
  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `sim-${crypto.randomUUID()}`
      : `sim-${uid()}-${Date.now()}`;
  window.localStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
}

/** Test-chat drawer: fires mock customer messages at the live agent webhook. */
export function ChatSimulator() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Test Customer");
  const [phone, setPhone] = useState("+447000000001");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [sessionId] = useState(getSimulatorSessionId);
  const fileRef = useRef<HTMLInputElement>(null);

  const push = (e: Omit<Entry, "id">) => setLog((l) => [...l, { id: uid(), ...e }]);

  const uploadMedia = async (): Promise<string | null> => {
    if (!file) return null;
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error } = await supabase.storage.from("chat-test-media").upload(path, file);
    if (error) {
      push({ direction: "system", text: `Upload failed: ${error.message}` });
      return null;
    }
    const { data } = await supabase.storage
      .from("chat-test-media")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl ?? null;
  };

  const send = async (raw: string) => {
    const content = raw.trim();
    if ((!content && !file) || busy) return;
    setBusy(true);
    try {
      const mediaUrl = await uploadMedia();
      const body = {
        phone: phone.trim() || undefined,
        name: name.trim() || undefined,
        session_id: sessionId,
        content: content || "(photo)",
        ...(mediaUrl ? { media_url: mediaUrl } : {}),
      };
      push({ direction: "sent", text: content || "(photo)", mediaUrl });
      setText("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";

      const res = await fetch("/api/public/agent-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        reply?: string | null;
        needs_human?: boolean;
        ai_paused?: boolean;
        telegram_alert?: { sent: boolean; reason?: string };
      };
      if (!res.ok || !data.ok) {
        push({ direction: "system", text: `Webhook error: ${data.error ?? res.status}` });
      } else if (data.ai_paused) {
        push({
          direction: "system",
          text: "AI is paused for this lead — a human must reply from the CRM.",
        });
      } else {
        push({ direction: "received", text: data.reply ?? "(no reply)" });
        if (data.needs_human) {
          push({
            direction: "system",
            text: `Handoff triggered · Telegram alert ${data.telegram_alert?.sent ? "sent" : `skipped (${data.telegram_alert?.reason ?? "n/a"})`}`,
          });
        }
      }
    } catch (err) {
      push({ direction: "system", text: `Request failed: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12]"
      >
        Test chat simulator
      </button>

      <div
        className={`fixed inset-y-0 right-0 z-[95] flex w-full max-w-md flex-col border-l border-white/10 bg-[#0b0d12]/90 backdrop-blur-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Chat Simulator</div>
            <div className="text-[11px] text-[#8b95a8]">
              Mock customer messages hit the live agent webhook
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="ml-auto rounded-full px-2 py-1 text-xs text-[#8b95a8] hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-white/10 px-5 py-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Customer name"
            className="rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-xs text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-lg border border-white/12 bg-white/[0.05] px-3 py-2 text-xs text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none"
          />
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {log.length === 0 && (
            <p className="text-xs text-[#8b95a8]">
              Send a message or pick a menu option to run the full webhook workflow.
            </p>
          )}
          {log.map((e) => (
            <div
              key={e.id}
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                e.direction === "sent"
                  ? "ml-auto bg-[#ff6a00] text-white"
                  : e.direction === "received"
                    ? "border border-white/10 bg-white/[0.05] text-[#dce3ee]"
                    : "mx-auto border border-amber-400/25 bg-amber-400/10 text-[11px] text-amber-200"
              }`}
            >
              {e.text}
              {e.mediaUrl && (
                <img
                  src={e.mediaUrl}
                  alt="Test attachment"
                  className="mt-2 max-h-40 rounded-lg"
                  loading="lazy"
                />
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => send(o.key)}
                disabled={busy}
                className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-[#c5cbd6] hover:bg-white/[0.1] disabled:opacity-50"
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-[11px] text-[#8b95a8] file:mr-2 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-[11px] file:text-white"
            />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type a mock customer message…"
              className="flex-1 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || (!text.trim() && !file)}
              className="rounded-full bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              {busy ? "…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
