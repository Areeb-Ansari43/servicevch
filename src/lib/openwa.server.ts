import { getRuntimeEnv } from "@/integrations/supabase/config";

export type OpenWaSendResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: string };

export type OpenWaHistoryMessage = {
  id?: string;
  from?: string;
  to?: string;
  body?: string;
  text?: string;
  type?: string;
  timestamp?: number | string;
  fromMe?: boolean;
  from_me?: boolean;
  hasMedia?: boolean;
  media?: { url?: string } | null;
};

export const WELCOME_MESSAGE =
  "Welcome to Virtual Car Hire, London's number 1 PCO rental.\n\n" +
  "Please choose an option:\n" +
  "1. Book a Car\n" +
  "2. Report Accident\n\n" +
  "Reply with 1 or 2 to continue.";

function firstNonEmpty(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

function normalizeApiKey(value: string): string {
  const trimmed = value.replace(/^\uFEFF/, "").trim();
  const quoted = trimmed.match(/^(?:\"(.*)\"|'(.*)')$/s);
  return (quoted?.[1] ?? quoted?.[2] ?? trimmed).trim();
}

function secretFingerprint(value: string): { length: number; prefix: string; suffix: string } {
  return {
    length: value.length,
    prefix: value.slice(0, 2),
    suffix: value.slice(-2),
  };
}

export function normalizeOpenWaChatId(value: unknown): string | null {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    value = firstNonEmpty(record._serialized, record.serialized, record.user, record.id);
  }
  const raw = firstNonEmpty(value)?.replace(/^whatsapp:/i, "");
  if (!raw) return null;
  if (/@(?:c|g)\.us$/i.test(raw) || /@lid$/i.test(raw)) return raw;
  if (/@s\.whatsapp\.net$/i.test(raw)) return raw.replace(/@s\.whatsapp\.net$/i, "@c.us");
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 ? `${digits}@c.us` : raw;
}

function openWaConfig() {
  const baseUrl = firstNonEmpty(
    getRuntimeEnv("OPENWA_API_URL"),
    getRuntimeEnv("OPENWA_BASE_URL"),
    getRuntimeEnv("OPENWA_URL"),
    getRuntimeEnv("OPENWA_TUNNEL_URL"),
  );
  const rawApiKey = firstNonEmpty(getRuntimeEnv("OPENWA_API_KEY"));
  const apiKey = rawApiKey ? normalizeApiKey(rawApiKey) : undefined;
  const sessionId = firstNonEmpty(
    getRuntimeEnv("OPENWA_SESSION_ID"),
    getRuntimeEnv("OPENWA_SESSION"),
    "vch-bot",
  ) ?? "vch-bot";
  return { baseUrl, apiKey, sessionId };
}

function gatewayBase(value: string): string {
  return value
    .replace(/\/api\/sessions\/[^/]+\/messages\/send-text\/?$/i, "")
    .replace(/\/api\/?$/i, "");
}

function openWaHeaders(apiKey: string) {
  return {
    "X-API-Key": apiKey,
    Authorization: `Bearer ${apiKey}`,
    "X-LocalTunnel-No-Client-Warning": "true",
  };
}

function resolveTransportSession(requestedSessionId?: string): { sessionId: string; requestedSessionId?: string } {
  const config = openWaConfig();
  const requested = firstNonEmpty(requestedSessionId);
  // OpenWA webhook payloads often contain the display name `vch-bot`; the REST
  // endpoint must use the configured active session ID/UUID when available.
  const configured = firstNonEmpty(getRuntimeEnv("OPENWA_SESSION_ID"), getRuntimeEnv("OPENWA_SESSION"));
  return {
    sessionId: configured ?? requested ?? config.sessionId,
    ...(requested ? { requestedSessionId: requested } : {}),
  };
}

export async function sendOpenWaText(params: {
  phone: unknown;
  text: string;
  sessionId?: string;
}): Promise<OpenWaSendResult> {
  const { baseUrl, apiKey } = openWaConfig();
  const transport = resolveTransportSession(params.sessionId);
  const sessionId = transport.sessionId;
  const chatId = normalizeOpenWaChatId(params.phone);
  if (!baseUrl || !apiKey) {
    console.error("[openwa] outbound not configured", { hasBaseUrl: Boolean(baseUrl), hasApiKey: Boolean(apiKey), sessionId });
    return { sent: false, reason: "openwa_not_configured" };
  }
  if (!chatId) return { sent: false, reason: "customer_chat_id_missing" };

  const endpoint = `${gatewayBase(baseUrl)}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`;
  console.info("[openwa] sending outbound text", {
    endpoint,
    sessionId,
    chatId,
    textLength: params.text.length,
    apiKeyFingerprint: secretFingerprint(apiKey),
    requestedSessionId: transport.requestedSessionId,
    headers: ["X-API-Key", "Authorization", "X-LocalTunnel-No-Client-Warning"],
  });
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { ...openWaHeaders(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ chatId, text: params.text, linkPreview: false }),
    });
    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      console.error("[openwa] outbound request rejected", { endpoint, sessionId, chatId, status: response.status, statusText: response.statusText, responseBody });
      const detail = responseBody.replace(/\s+/g, " ").slice(0, 500);
      return { sent: false, reason: `openwa_http_${response.status}${detail ? `: ${detail}` : ""}` };
    }
    const body = (await response.json().catch(() => ({}))) as { messageId?: string };
    console.info("[openwa] outbound text accepted", { sessionId, chatId, status: response.status, messageId: body.messageId });
    return { sent: true, messageId: body.messageId };
  } catch (error) {
    console.error("[openwa] outbound request failed", { sessionId, chatId, error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "openwa_network_error" };
  }
}

export async function resolveOpenWaPhone(params: {
  chatId: unknown;
  sessionId?: string;
}): Promise<string | null> {
  const { baseUrl, apiKey } = openWaConfig();
  const transport = resolveTransportSession(params.sessionId);
  const sessionId = transport.sessionId;
  const chatId = normalizeOpenWaChatId(params.chatId);
  if (!baseUrl || !apiKey || !chatId || !/@lid$/i.test(chatId)) return null;
  const endpoint = `${gatewayBase(baseUrl)}/api/sessions/${encodeURIComponent(sessionId)}/contacts/${encodeURIComponent(chatId)}/phone`;
  console.info("[openwa] resolving linked contact phone", { endpoint, sessionId, chatId });
  try {
    const response = await fetch(endpoint, { headers: openWaHeaders(apiKey) });
    const bodyText = await response.text();
    if (!response.ok) {
      console.warn("[openwa] linked contact phone unavailable", { endpoint, sessionId, chatId, status: response.status, responseBody: bodyText.slice(0, 500) });
      return null;
    }
    const parsed = JSON.parse(bodyText) as unknown;
    const candidate = typeof parsed === "string"
      ? parsed
      : parsed && typeof parsed === "object"
        ? firstNonEmpty((parsed as Record<string, unknown>).phone, (parsed as Record<string, unknown>).phoneNumber, (parsed as Record<string, unknown>).number, (parsed as Record<string, unknown>).id)
        : undefined;
    const resolved = normalizeOpenWaChatId(candidate);
    return resolved && !/@lid$/i.test(resolved) ? resolved : null;
  } catch (error) {
    console.warn("[openwa] linked contact phone lookup failed", { sessionId, chatId, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function fetchOpenWaHistory(params: {
  chatId: unknown;
  sessionId?: string;
}): Promise<{ ok: true; messages: OpenWaHistoryMessage[] } | { ok: false; reason: string }> {
  const { baseUrl, apiKey } = openWaConfig();
  const transport = resolveTransportSession(params.sessionId);
  const sessionId = transport.sessionId;
  const chatId = normalizeOpenWaChatId(params.chatId);
  if (!baseUrl || !apiKey) return { ok: false, reason: "openwa_not_configured" };
  if (!chatId) return { ok: false, reason: "customer_chat_id_missing" };
  const endpoint = `${gatewayBase(baseUrl)}/api/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(chatId)}/history?limit=100&deep=true`;
  console.info("[openwa] fetching live chat history", { endpoint, sessionId, chatId });
  try {
    const response = await fetch(endpoint, { headers: openWaHeaders(apiKey) });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error("[openwa] history request rejected", { endpoint, sessionId, chatId, status: response.status, statusText: response.statusText, responseBody: bodyText });
      return { ok: false, reason: `openwa_history_http_${response.status}` };
    }
    const parsed = JSON.parse(bodyText) as unknown;
    const messages = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === "object" && Array.isArray((parsed as { messages?: unknown[] }).messages)
        ? (parsed as { messages: unknown[] }).messages
        : []);
    console.info("[openwa] live chat history received", { sessionId, chatId, count: messages.length });
    return { ok: true, messages: messages as OpenWaHistoryMessage[] };
  } catch (error) {
    console.error("[openwa] history request failed", { sessionId, chatId, error: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "openwa_history_network_error" };
  }
}
