import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { testAiProviders } from "@/lib/chat.functions";
import { type ProviderTestResult } from "@/lib/ai-providers";

export function TestAiProvidersCard({ toast }: { toast: (m: string, t?: "success" | "error" | "info") => void }) {
  const runTestFn = useServerFn(testAiProviders);
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<ProviderTestResult[] | null>(null);

  const handleRunTests = async () => {
    try {
      setTesting(true);
      const res = await runTestFn();
      setResults(res.results);
      const allPassed = res.results.every((r) => r.status === "ok");
      if (allPassed) {
        toast("All AI providers tested successfully!", "success");
      } else {
        toast("One or more AI providers failed or are degraded", "error");
      }
    } catch (err: any) {
      toast(err?.message || "Failed to execute AI provider test", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-xl backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span>⚡ AI Assistant Diagnostic Tests</span>
          </h3>
          <p className="mt-1 text-xs text-zinc-400">
            Test connection, latency, and response generation across Google Gemini, Groq, and xAI Grok.
          </p>
        </div>
        <button
          type="button"
          disabled={testing}
          onClick={handleRunTests}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-emerald-500 disabled:opacity-50 transition-all flex items-center gap-2"
        >
          {testing ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Testing Providers...
            </>
          ) : (
            "Test AI Now"
          )}
        </button>
      </div>

      {results && results.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-white/10 pt-4">
          {results.map((r, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-zinc-950/60 p-4 text-xs font-mono transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-white text-sm">
                  <span>{r.provider}</span>
                  <span className="text-zinc-500 text-xs font-normal">({r.model})</span>
                </div>
                <div>
                  {r.status === "ok" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                      ● OK ({r.latencyMs}ms)
                    </span>
                  ) : r.status === "skipped_circuit_breaker" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/30">
                      ⚠ Circuit Open (Paused)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-400 border border-red-500/30">
                      ✕ Failed ({r.latencyMs}ms)
                    </span>
                  )}
                </div>
              </div>

              {r.sampleReply && (
                <div className="mt-2 text-zinc-300 bg-zinc-900/80 p-2.5 rounded-lg border border-white/5 font-sans">
                  <span className="text-zinc-500 text-[10px] uppercase tracking-wider block mb-1">
                    Sample Response:
                  </span>
                  "{r.sampleReply}"
                </div>
              )}

              {r.error && (
                <div className="mt-2 text-red-400 bg-red-950/30 p-2.5 rounded-lg border border-red-500/20">
                  <span className="text-red-500 font-bold block mb-0.5">Error Detail:</span>
                  {r.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
