import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askApex } from "@/lib/apex.functions";
import { VapiVoiceButton } from "@/components/vapi-widget";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "MOTs expiring within 10 days?",
  "Which PCO licences expire soon?",
  "Overdue checks?",
  "New WhatsApp leads?",
  "Total service spend this month?",
];

export function ApexAssistant(_props: { vehicles?: unknown; services?: unknown; drivers?: unknown }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hi, I'm Apex. Ask me anything about your fleet — MOTs, PCO licences, mileage, service costs or new leads.",
    },
  ]);
  const ask = useServerFn(askApex);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const history = messages.filter((m) => m.content).slice(-8);
    setMessages((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await ask({ data: { question: q, history } });
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    } catch (err) {
      console.error("[Apex] request failed", err);
      setMessages((m) => [...m, { role: "assistant", content: "Sorry — I couldn't answer that just now." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      <div className="fixed bottom-6 right-6 z-[80] flex flex-col items-end gap-3">
        <VapiVoiceButton />
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Open Apex AI assistant"
          className="group flex items-center gap-2.5 rounded-full border border-white/15 bg-white/[0.08] py-3 pl-3 pr-5 text-sm font-semibold text-white shadow-2xl backdrop-blur-xl transition-all hover:bg-white/[0.14]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-white shadow-lg shadow-orange-500/40">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3l1.8 4.9L19 9.7l-4.4 3 .5 5.3-3.1-2.5-3.1 2.5.5-5.3-4.4-3 5.2-1.8z" />
            </svg>
          </span>
          Apex AI
        </button>
      </div>

      {/* Glass side panel */}
      <div
        className={`fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col border-l border-white/10 bg-[#0b0d12]/80 backdrop-blur-2xl transition-transform duration-300 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6a00] to-[#ff9d4d] text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 3l1.8 4.9L19 9.7l-4.4 3 .5 5.3-3.1-2.5-3.1 2.5.5-5.3-4.4-3 5.2-1.8z" />
            </svg>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white">Apex AI</div>
            <div className="text-[11px] text-[#8b95a8]">Answers from your live fleet data</div>
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto rounded-full p-1.5 text-[#8b95a8] hover:bg-white/10 hover:text-white" aria-label="Close Apex">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "ml-auto bg-[#ff6a00] text-white"
                  : "border border-white/10 bg-white/[0.05] text-[#dce3ee]"
              }`}
            >
              {m.content}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-[#8b95a8]">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#ff6a00] [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#ff6a00] [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#ff6a00] [animation-delay:240ms]" />
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-5 py-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={busy}
                className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-[11px] text-[#c5cbd6] transition-colors hover:bg-white/[0.1] disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Apex about your fleet…"
              className="flex-1 rounded-full border border-white/12 bg-white/[0.05] px-4 py-2.5 text-sm text-white placeholder:text-[#5b6478] focus:border-[#ff6a00] focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-full bg-[#ff6a00] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#e05d00] disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
