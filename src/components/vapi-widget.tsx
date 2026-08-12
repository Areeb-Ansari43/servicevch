import { useCallback, useEffect, useRef, useState } from "react";
import { isVapiConfigured, vapiConfig, warnVapiMissing } from "@/lib/integrations-config";

type CallState = "idle" | "connecting" | "listening" | "speaking" | "error";

/**
 * "Talk to Apex" — voice front-end for the same Apex assistant.
 * No-ops (disabled button + console warning) until VITE_VAPI_API_KEY and
 * VITE_VAPI_ASSISTANT_ID are provided.
 */
export function VapiVoiceButton() {
  const [state, setState] = useState<CallState>("idle");
  const [transcript, setTranscript] = useState<string>("");
  const vapiRef = useRef<any>(null);
  const configured = isVapiConfigured();

  useEffect(() => {
    if (!configured) warnVapiMissing();
    return () => {
      try { vapiRef.current?.stop?.(); } catch { /* ignore */ }
      vapiRef.current = null;
    };
  }, [configured]);

  const start = useCallback(async () => {
    if (!configured) { warnVapiMissing(); return; }
    try {
      setState("connecting");
      if (!vapiRef.current) {
        const { default: Vapi } = await import("@vapi-ai/web");
        const vapi = new Vapi(vapiConfig.publicKey);
        vapi.on("call-start", () => setState("listening"));
        vapi.on("call-end", () => { setState("idle"); setTranscript(""); });
        vapi.on("speech-start", () => setState("speaking"));
        vapi.on("speech-end", () => setState("listening"));
        vapi.on("message", (msg: any) => {
          if (msg?.type === "transcript" && msg?.transcript) setTranscript(String(msg.transcript));
        });
        vapi.on("error", (err: any) => {
          console.error("[Vapi] error", err);
          setState("error");
        });
        vapiRef.current = vapi;
      }
      await vapiRef.current.start(vapiConfig.assistantId);
    } catch (err) {
      console.error("[Vapi] failed to start call", err);
      setState("error");
    }
  }, [configured]);

  const stop = useCallback(() => {
    try { vapiRef.current?.stop?.(); } catch (err) { console.warn("[Vapi] stop failed", err); }
    setState("idle");
    setTranscript("");
  }, []);

  const active = state === "listening" || state === "speaking" || state === "connecting";
  const label =
    state === "connecting" ? "Connecting…"
    : state === "listening" ? "Listening…"
    : state === "speaking" ? "Apex speaking…"
    : state === "error" ? "Voice unavailable"
    : "Talk to Apex";

  return (
    <div className="flex flex-col items-end gap-1.5">
      {transcript && (
        <div className="max-w-[260px] truncate rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] text-[#c5cbd6] backdrop-blur-xl">
          {transcript}
        </div>
      )}
      <button
        onClick={active ? stop : start}
        disabled={!configured && state === "idle" ? false : false}
        title={configured ? label : "Voice assistant not configured yet"}
        className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-xl backdrop-blur-xl transition-all ${
          active
            ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
            : configured
              ? "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
              : "border-white/10 bg-white/[0.03] text-[#7c8698]"
        }`}
      >
        <span className={`relative flex h-2 w-2 rounded-full ${active ? "bg-emerald-400" : configured ? "bg-[#ff6a00]" : "bg-[#4b5566]"}`}>
          {active && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />}
        </span>
        {configured ? label : "Voice (setup pending)"}
      </button>
    </div>
  );
}
