import { getRuntimeEnv } from "@/integrations/supabase/config";

export type ProviderType = "gemini" | "groq" | "grok";

export type ProviderTestResult = {
  provider: string;
  status: "ok" | "failed" | "skipped_circuit_breaker";
  latencyMs: number;
  model: string;
  sampleReply?: string;
  error?: string;
};

// --- In-Memory Circuit Breaker & Caching State ---
type CircuitState = {
  consecutiveFailures: number;
  disabledUntil: number;
};

const circuitBreakers: Record<string, CircuitState> = {
  gemini: { consecutiveFailures: 0, disabledUntil: 0 },
  groq: { consecutiveFailures: 0, disabledUntil: 0 },
  grok: { consecutiveFailures: 0, disabledUntil: 0 },
};

export function isCircuitOpen(provider: string): boolean {
  const state = circuitBreakers[provider];
  if (!state) return false;
  if (state.disabledUntil > Date.now()) {
    return true;
  }
  return false;
}

export function recordSuccess(provider: string) {
  if (!circuitBreakers[provider]) {
    circuitBreakers[provider] = { consecutiveFailures: 0, disabledUntil: 0 };
  } else {
    circuitBreakers[provider].consecutiveFailures = 0;
    circuitBreakers[provider].disabledUntil = 0;
  }
}

export function recordFailure(provider: string) {
  if (!circuitBreakers[provider]) {
    circuitBreakers[provider] = { consecutiveFailures: 1, disabledUntil: 0 };
  } else {
    circuitBreakers[provider].consecutiveFailures += 1;
    if (circuitBreakers[provider].consecutiveFailures >= 2) {
      // Open circuit for 2 minutes (120,000 ms)
      circuitBreakers[provider].disabledUntil = Date.now() + 120_000;
      console.warn(`[ai-providers] Circuit breaker TRIPPED for '${provider}'. Pausing provider for 2 minutes.`);
    }
  }
}

// --- Model Discovery Caching (6 hours) ---
type ModelCache = {
  models: string[];
  fetchedAt: number;
};

const modelCaches: Record<string, ModelCache> = {};
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

// --- Key & Provider Detection ---
export function detectGeminiKey(): { apiKey: string; keyBinding: string } | null {
  const bindings = [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "VITE_GEMINI_API_KEY",
  ];
  for (const b of bindings) {
    const val = getRuntimeEnv(b)?.trim();
    if (val) return { apiKey: val, keyBinding: b };
  }
  return null;
}

export function detectSecondaryProvider(): {
  provider: "groq" | "grok";
  apiKey: string;
  baseUrl: string;
  keyBinding: string;
} | null {
  const bindings = [
    "GROQ_API_KEY",
    "XAI_API_KEY",
    "GROK_API_KEY",
    "GROQ_API_TOKEN",
    "VITE_GROQ_API_KEY",
    "VITE_GROK_API_KEY",
    "GROK_API_TOKEN",
  ];

  for (const b of bindings) {
    const val = getRuntimeEnv(b)?.trim();
    if (!val) continue;

    // Detect provider based on key prefix or variable name
    if (val.startsWith("xai-")) {
      return { provider: "grok", apiKey: val, baseUrl: "https://api.x.ai/v1", keyBinding: b };
    }
    if (val.startsWith("gsk_")) {
      return { provider: "groq", apiKey: val, baseUrl: "https://api.groq.com/openai/v1", keyBinding: b };
    }
    if (b.includes("XAI") || b.includes("GROK")) {
      return { provider: "grok", apiKey: val, baseUrl: "https://api.x.ai/v1", keyBinding: b };
    }
    if (b.includes("GROQ")) {
      return { provider: "groq", apiKey: val, baseUrl: "https://api.groq.com/openai/v1", keyBinding: b };
    }
  }

  return null;
}

/** Sanitize text to remove any potential API keys from error messages */
export function sanitizeErrorMessage(msg: string): string {
  if (!msg) return "";
  return msg
    .replace(/AIzaSy[A-Za-z0-9_-]{20,}/g, "AIzaSy***")
    .replace(/gsk_[A-Za-z0-9_-]{20,}/g, "gsk_***")
    .replace(/xai-[A-Za-z0-9_-]{20,}/g, "xai-***")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "sk-***");
}

// --- Dynamic Model Discovery ---
export async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  const cacheKey = `gemini_${apiKey.slice(-6)}`;
  const now = Date.now();
  if (modelCaches[cacheKey] && now - modelCaches[cacheKey].fetchedAt < SIX_HOURS_MS) {
    return modelCaches[cacheKey].models;
  }

  const configuredModel = getRuntimeEnv("GEMINI_MODEL")?.trim();
  const fallbackList = [
    "gemini-3.6-flash",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  let discovered: string[] = [];
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as {
        models?: { name: string; supportedGenerationMethods?: string[] }[];
      };
      if (Array.isArray(data.models)) {
        discovered = data.models
          .filter((m) =>
            m.supportedGenerationMethods
              ? m.supportedGenerationMethods.includes("generateContent")
              : true,
          )
          .map((m) => m.name.replace(/^models\//, ""))
          .filter((name) => name.includes("flash") || name.includes("gemini"));
      }
    }
  } catch (err) {
    console.warn("[ai-providers] Gemini model discovery fetch failed, using defaults:", err);
  }

  // Combine configured, discovered, and fallbacks cleanly
  const merged = new Set<string>();
  if (configuredModel) merged.add(configuredModel);
  for (const m of discovered) {
    if (m.includes("flash") || m.includes("gemini-3") || m.includes("gemini-2")) {
      merged.add(m);
    }
  }
  for (const f of fallbackList) {
    merged.add(f);
  }

  const result = Array.from(merged);
  modelCaches[cacheKey] = { models: result, fetchedAt: now };
  return result;
}

export async function discoverOpenAIStyleModels(
  baseUrl: string,
  apiKey: string,
  provider: "groq" | "grok",
): Promise<string[]> {
  const cacheKey = `${provider}_${apiKey.slice(-6)}`;
  const now = Date.now();
  if (modelCaches[cacheKey] && now - modelCaches[cacheKey].fetchedAt < SIX_HOURS_MS) {
    return modelCaches[cacheKey].models;
  }

  const configuredModel = getRuntimeEnv(
    provider === "groq" ? "GROQ_MODEL" : "GROK_MODEL",
  )?.trim();
  const fallbackList =
    provider === "groq"
      ? ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"]
      : ["grok-2-latest", "grok-beta", "grok-2"];

  let discovered: string[] = [];
  try {
    const url = `${baseUrl}/models`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string }[] };
      if (Array.isArray(data.data)) {
        discovered = data.data.map((m) => m.id);
      }
    }
  } catch (err) {
    console.warn(`[ai-providers] ${provider} model discovery fetch failed, using defaults:`, err);
  }

  const merged = new Set<string>();
  if (configuredModel) merged.add(configuredModel);
  for (const m of discovered) merged.add(m);
  for (const f of fallbackList) merged.add(f);

  const result = Array.from(merged);
  modelCaches[cacheKey] = { models: result, fetchedAt: now };
  return result;
}

// --- Fetch with Timeout and Retry ---
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs = 12000,
): Promise<{ res: Response; bodyText: string }> {
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < 2) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      const bodyText = await res.text();

      // Retry on 429 or 5xx status code
      if ((res.status === 429 || res.status >= 500) && attempt === 1) {
        console.warn(
          `[ai-providers] HTTP ${res.status} from ${url}. Retrying attempt 2 in 1000ms...`,
        );
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      return { res, bodyText };
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err;
      if (attempt === 1) {
        console.warn(`[ai-providers] Network exception from ${url}. Retrying attempt 2...`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw lastError || new Error("Request failed after retries");
}

// --- Execute Gemini AI Request ---
export async function callGeminiProvider(params: {
  system: string;
  userText: string;
  tools?: any[];
  timeoutMs?: number;
}): Promise<{ reply: string; model: string; latencyMs: number; toolCalls?: any[] }> {
  if (isCircuitOpen("gemini")) {
    throw new Error("gemini_circuit_open: Provider paused due to consecutive failures");
  }

  const detected = detectGeminiKey();
  if (!detected) {
    throw new Error("gemini_api_key_missing: No Gemini API key found in environment");
  }

  const models = await discoverGeminiModels(detected.apiKey);
  const startTime = Date.now();
  let lastErrReason = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${detected.apiKey}`;
    const reqBody: any = {
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: "user", parts: [{ text: params.userText }] }],
      generationConfig: { temperature: 0.2 },
    };

    if (params.tools && params.tools.length > 0) {
      reqBody.tools = params.tools;
    }

    try {
      const { res, bodyText } = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        },
        params.timeoutMs ?? 12000,
      );

      if (!res.ok) {
        lastErrReason = `gemini_http_${res.status}: ${sanitizeErrorMessage(bodyText.slice(0, 200))}`;
        console.warn(`[ai-providers] Gemini model '${model}' failed: ${lastErrReason}`);
        continue;
      }

      const data = JSON.parse(bodyText);
      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts || [];

      // Extract text or function/tool calls
      const textParts = parts
        .filter((p: any) => typeof p.text === "string")
        .map((p: any) => p.text);
      const toolCallParts = parts.filter((p: any) => p.functionCall);

      const replyText = textParts.join("\n").trim();
      const toolCalls = toolCallParts.map((p: any) => ({
        name: p.functionCall.name,
        args: p.functionCall.args,
      }));

      if (!replyText && toolCalls.length === 0) {
        lastErrReason = "gemini_empty_response";
        continue;
      }

      recordSuccess("gemini");
      const latencyMs = Date.now() - startTime;
      return { reply: replyText, model, latencyMs, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    } catch (err: any) {
      lastErrReason = `gemini_exception: ${sanitizeErrorMessage(err.message || String(err))}`;
      console.warn(`[ai-providers] Gemini model '${model}' exception:`, err);
    }
  }

  recordFailure("gemini");
  throw new Error(lastErrReason || "gemini_all_models_failed");
}

// --- Execute Secondary AI Request (Groq or xAI Grok) ---
export async function callSecondaryProvider(params: {
  system: string;
  userText: string;
  tools?: any[];
  timeoutMs?: number;
}): Promise<{
  reply: string;
  provider: "groq" | "grok";
  model: string;
  latencyMs: number;
  toolCalls?: any[];
}> {
  const secondary = detectSecondaryProvider();
  if (!secondary) {
    throw new Error("secondary_api_key_missing: No Groq or xAI Grok API key found in environment");
  }

  const provider = secondary.provider;
  if (isCircuitOpen(provider)) {
    throw new Error(`${provider}_circuit_open: Secondary provider paused due to consecutive failures`);
  }

  const models = await discoverOpenAIStyleModels(secondary.baseUrl, secondary.apiKey, provider);
  const startTime = Date.now();
  let lastErrReason = "";

  for (const model of models) {
    const url = `${secondary.baseUrl}/chat/completions`;
    const reqBody: any = {
      model,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.userText },
      ],
      temperature: 0.2,
    };

    if (params.tools && params.tools.length > 0) {
      reqBody.tools = params.tools;
    }

    try {
      const { res, bodyText } = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secondary.apiKey}`,
          },
          body: JSON.stringify(reqBody),
        },
        params.timeoutMs ?? 12000,
      );

      if (!res.ok) {
        lastErrReason = `${provider}_http_${res.status}: ${sanitizeErrorMessage(bodyText.slice(0, 200))}`;
        console.warn(`[ai-providers] ${provider} model '${model}' failed: ${lastErrReason}`);
        continue;
      }

      const data = JSON.parse(bodyText);
      const choice = data.choices?.[0]?.message;
      const replyText = choice?.content?.trim() || "";
      const rawToolCalls = choice?.tool_calls || [];
      const toolCalls = rawToolCalls.map((tc: any) => ({
        name: tc.function?.name,
        args: typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function?.arguments,
      }));

      if (!replyText && toolCalls.length === 0) {
        lastErrReason = `${provider}_empty_response`;
        continue;
      }

      recordSuccess(provider);
      const latencyMs = Date.now() - startTime;
      return {
        reply: replyText,
        provider,
        model,
        latencyMs,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (err: any) {
      lastErrReason = `${provider}_exception: ${sanitizeErrorMessage(err.message || String(err))}`;
      console.warn(`[ai-providers] ${provider} model '${model}' exception:`, err);
    }
  }

  recordFailure(provider);
  throw new Error(lastErrReason || `${provider}_all_models_failed`);
}

// --- Run AI Diagnostic Tests ---
export async function testAiProvidersDiagnostic(): Promise<ProviderTestResult[]> {
  const results: ProviderTestResult[] = [];
  const testPrompt = "Hello! Please reply with exactly 'OK'.";
  const testSystem = "You are a test assistant. Reply concisely.";

  // 1. Test Gemini
  if (isCircuitOpen("gemini")) {
    results.push({
      provider: "Google Gemini",
      status: "skipped_circuit_breaker",
      latencyMs: 0,
      model: "gemini-3.6-flash",
      error: "Circuit breaker open (paused for 2 minutes after consecutive failures)",
    });
  } else {
    const start = Date.now();
    try {
      const res = await callGeminiProvider({ system: testSystem, userText: testPrompt, timeoutMs: 10000 });
      results.push({
        provider: "Google Gemini",
        status: "ok",
        latencyMs: res.latencyMs,
        model: res.model,
        sampleReply: res.reply,
      });
    } catch (err: any) {
      results.push({
        provider: "Google Gemini",
        status: "failed",
        latencyMs: Date.now() - start,
        model: "gemini-3.6-flash",
        error: sanitizeErrorMessage(err.message || String(err)),
      });
    }
  }

  // 2. Test Secondary Provider (Groq / xAI Grok)
  const secondaryInfo = detectSecondaryProvider();
  const secondaryName = secondaryInfo
    ? secondaryInfo.provider === "groq"
      ? "Groq API"
      : "xAI Grok"
    : "Secondary Provider (Groq/Grok)";

  if (!secondaryInfo) {
    results.push({
      provider: secondaryName,
      status: "failed",
      latencyMs: 0,
      model: "none",
      error: "No GROQ_API_KEY or XAI_API_KEY environment variables configured",
    });
  } else if (isCircuitOpen(secondaryInfo.provider)) {
    results.push({
      provider: secondaryName,
      status: "skipped_circuit_breaker",
      latencyMs: 0,
      model: secondaryInfo.provider === "groq" ? "llama-3.3-70b-versatile" : "grok-2-latest",
      error: "Circuit breaker open (paused for 2 minutes after consecutive failures)",
    });
  } else {
    const start = Date.now();
    try {
      const res = await callSecondaryProvider({ system: testSystem, userText: testPrompt, timeoutMs: 10000 });
      results.push({
        provider: `${secondaryName} (${res.provider})`,
        status: "ok",
        latencyMs: res.latencyMs,
        model: res.model,
        sampleReply: res.reply,
      });
    } catch (err: any) {
      results.push({
        provider: secondaryName,
        status: "failed",
        latencyMs: Date.now() - start,
        model: secondaryInfo.provider === "groq" ? "llama-3.3-70b-versatile" : "grok-2-latest",
        error: sanitizeErrorMessage(err.message || String(err)),
      });
    }
  }

  return results;
}
