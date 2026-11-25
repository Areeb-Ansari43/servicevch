import { getRuntimeEnv } from "@/integrations/supabase/config";

/**
 * One place for the AI photo readers (licence, odometer): asks Gemini for JSON about an image,
 * trying the configured model and then current backups.
 *
 * Speed: "thinking" is turned off on Flash / Flash-Lite models (it adds seconds and isn't needed
 * to read printed text). Pro models refuse that setting, so it is never sent to them, and if any
 * model rejects it the same model is asked again without it.
 */
export const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-2.0-flash"];

export function geminiApiKey(): string {
  return (
    getRuntimeEnv("GEMINI_API_KEY") ??
    getRuntimeEnv("GOOGLE_API_KEY") ??
    getRuntimeEnv("GOOGLE_GEMINI_API_KEY") ??
    getRuntimeEnv("VITE_GEMINI_API_KEY") ??
    ""
  ).trim();
}

export function modelsToTry(): string[] {
  const configured = (getRuntimeEnv("GEMINI_MODEL") ?? "").trim();
  return [...new Set([configured, ...FALLBACK_MODELS].filter(Boolean))];
}

/** Thinking can be switched off on 2.5 Flash / Flash-Lite only. */
export function canSkipThinking(model: string): boolean {
  return /2\.5-flash/.test(model);
}

export type GeminiJsonResult =
  | { ok: true; json: unknown; model: string }
  | { ok: false; reason: string; tried: string[] };

export async function geminiImageJson(opts: {
  prompt: string;
  mimeType: string;
  base64: string;
  timeoutMs?: number;
  /** Return true to accept this answer; false asks the next model (e.g. an unsure read). */
  accept?: (json: unknown) => boolean;
  /** Let the model think first: slower, but more careful (used for a second look). */
  thinking?: boolean;
}): Promise<GeminiJsonResult & { fallback?: unknown }> {
  const key = geminiApiKey();
  if (!key) return { ok: false, reason: "no_api_key", tried: [] };
  const tried: string[] = [];
  let lastReason = "no_models";
  let fallback: { json: unknown; model: string } | null = null;

  for (const model of modelsToTry()) {
    for (const skipThinking of canSkipThinking(model) && !opts.thinking ? [true, false] : [false]) {
      tried.push(model + (skipThinking ? "" : " (thinking)"));
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: opts.prompt }, { inlineData: { mimeType: opts.mimeType, data: opts.base64 } }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0,
              ...(skipThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
            },
          }),
        });
        if (!res.ok) {
          const body = (await res.text().catch(() => "")).slice(0, 300);
          lastReason = `http_${res.status}`;
          console.warn(`[gemini-vision] ${model}${skipThinking ? "" : " (thinking)"} -> ${res.status}: ${body.replace(/\s+/g, " ")}`);
          // Rejected the thinking setting: retry this model without it. Otherwise next model.
          if (skipThinking && res.status === 400 && /thinking/i.test(body)) continue;
          break;
        }
        const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        const json = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
        if (!opts.accept || opts.accept(json)) return { ok: true, json, model };
        fallback = fallback ?? { json, model };
        break;
      } catch (err) {
        lastReason = err instanceof Error && /timeout|abort/i.test(err.name + err.message) ? "timeout" : "bad_response";
        console.warn(`[gemini-vision] ${model} failed: ${lastReason}`);
        break;
      }
    }
  }
  if (fallback) return { ok: true, json: fallback.json, model: fallback.model };
  return { ok: false, reason: lastReason, tried };
}
