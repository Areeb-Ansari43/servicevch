import { getRuntimeEnv } from "@/integrations/supabase/config";

export type OpenWaSendResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: string };

export const WELCOME_MESSAGE =
  "Welcome to Virtual Car Hire, London's number 1 PCO rental.\n\n" +
  "Please choose an option:\n" +
  "1. Book a Car\n" +
  "2. Report Accident\n\n" +
  "Reply with 1 or 2 to continue.";

function firstNonEmpty(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

export function normalizeOpenWaChatId(value: string | null | undefined): string | null {
  const raw = firstNonEmpty(value)?.replace(/^whatsapp:/i, "");
  if (!raw) return null;
  if (/@(?:c|g|lid)\.us$/i.test(raw)) return raw;
  if (/@s\.whatsapp\.net$/i.test(raw)) return raw.replace(/@s\.whatsapp\.net$/i, "@c.us");
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 ? `${digits}@c.us` : raw;
}

export async function sendOpenWaText(params: {
  phone: string | null | undefined;
  text: string;
  sessionId?: string;
}): Promise<OpenWaSendResult> {
  const baseUrl = firstNonEmpty(
    getRuntimeEnv("OPENWA_API_URL"),
    getRuntimeEnv("OPENWA_BASE_URL"),
    getRuntimeEnv("OPENWA_URL"),
    getRuntimeEnv("OPENWA_TUNNEL_URL"),
  );
  const apiKey = firstNonEmpty(
    getRuntimeEnv("OPENWA_API_KEY"),
    getRuntimeEnv("OPENWA_API_TOKEN"),
    getRuntimeEnv("OPENWA_OUTBOUND_API_KEY"),
    getRuntimeEnv("OPENWA_TOKEN"),
  );
  const sessionId = firstNonEmpty(
    params.sessionId,
    getRuntimeEnv("OPENWA_SESSION_ID"),
    getRuntimeEnv("OPENWA_SESSION"),
    "vch-bot",
  ) ?? "vch-bot";
  const chatId = normalizeOpenWaChatId(params.phone);
  if (!baseUrl || !apiKey) {
    console.error("[openwa] outbound not configured", { hasBaseUrl: Boolean(baseUrl), hasApiKey: Boolean(apiKey), sessionId });
    return { sent: false, reason: "openwa_not_configured" };
  }
  if (!chatId) return { sent: false, reason: "customer_chat_id_missing" };

  const gatewayBase = baseUrl
    .replace(/\/api\/sessions\/[^/]+\/messages\/send-text\/?$/i, "")
    .replace(/\/api\/?$/i, "");
  const endpoint = `${gatewayBase}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ chatId, text: params.text, linkPreview: false }),
    });
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 240).replace(/\s+/g, " ");
      return { sent: false, reason: `openwa_http_${response.status}${detail ? `: ${detail}` : ""}` };
    }
    const body = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { sent: true, messageId: body.messageId };
  } catch {
    return { sent: false, reason: "openwa_network_error" };
  }
}
