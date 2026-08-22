import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { handleAgentWebhookRequest } from "./public/agent-webhook";

type JsonRecord = Record<string, unknown>;
type NormalizedMessage = {
  eventName: string;
  phone?: string;
  chat_id?: string;
  name?: string;
  content: string;
  media_url?: string;
  session_id?: string;
};

const MAX_LOG_BYTES = 512_000;
const MAX_TEXT_BYTES = 20_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string | undefined {
  return values
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();
}

function recordValue(record: JsonRecord | undefined, ...keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function phoneFrom(value: unknown): string | undefined {
  if (isRecord(value)) value = stringValue(value._serialized, value.serialized, value.user, value.id);
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/^whatsapp:/i, "");
  if (/@lid$/i.test(cleaned)) return cleaned;
  const normalized = cleaned.replace(/@s\.whatsapp\.net$/i, "@c.us");
  const jid = /@(c|g)\.us$/i.test(normalized) ? normalized : `${normalized.replace(/\D/g, "")}@c.us`;
  return jid.length >= 9 ? jid : undefined;
}

function phoneFromCandidates(...values: unknown[]): string | undefined {
  const candidates = values.map(phoneFrom).filter((value): value is string => Boolean(value));
  return candidates.find((value) => /@c\.us$/i.test(value)) ?? candidates[0];
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function headerSnapshot(request: Request): JsonRecord {
  const safe: JsonRecord = {};
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    safe[key] = /authorization|api-key|signature|secret|token/.test(lower)
      ? "[redacted]"
      : value.slice(0, 500);
  });
  return safe;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function verifyWebhookSecret(request: Request, rawBody: string): Promise<boolean> {
  const expectedSecret = getRuntimeEnv("OPENWA_WEBHOOK_SECRET");
  if (!expectedSecret) return true;
  const provided =
    request.headers.get("x-openwa-signature") ?? request.headers.get("x-webhook-signature");
  if (!provided) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(expectedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const digest = Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const normalized = provided.replace(/^sha256=/i, "").trim();
  return constantTimeEqual(normalized, digest);
}

function verifyWebhookApiKey(request: Request): boolean {
  const expectedKey = getRuntimeEnv("OPENWA_API_KEY");
  if (!expectedKey) return true;
  const apiKey = request.headers.get("x-api-key");
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return [apiKey, bearer].some((provided) =>
    Boolean(provided && constantTimeEqual(provided, expectedKey)),
  );
}

function unwrapPayload(raw: JsonRecord): {
  eventName: string;
  message: JsonRecord;
  session?: string;
} {
  const data = isRecord(raw.data) ? raw.data : undefined;
  const payload = isRecord(raw.payload) ? raw.payload : undefined;
  const eventName =
    stringValue(
      raw.event,
      raw.type,
      raw.eventName,
      data?.event,
      data?.type,
      payload?.event,
      payload?.type,
    ) ?? "message.received";
  const message = isRecord(raw.message)
    ? raw.message
    : isRecord(data?.message)
      ? data.message
      : isRecord(payload?.message)
        ? payload.message
        : (data ?? payload ?? raw);
  const session = stringValue(
    raw.session,
    raw.sessionId,
    raw.session_id,
    data?.session,
    data?.sessionId,
    data?.session_id,
    payload?.session,
    payload?.sessionId,
    payload?.session_id,
  );
  return { eventName, message, ...(session ? { session } : {}) };
}

function normalizeInbound(raw: JsonRecord): NormalizedMessage | null {
  const { eventName, message, session } = unwrapPayload(raw);
  const receivedFlag = recordValue(message, "received");
  const isInbound =
    receivedFlag === true ||
    /message[._]received/i.test(eventName) ||
    (eventName === "message" && !recordValue(message, "fromMe", "from_me", "isFromMe"));
  if (!isInbound) return null;

  const sender = isRecord(message.sender) ? message.sender : undefined;
  const chat = isRecord(message.chat) ? message.chat : undefined;
  const messageData = isRecord(message._data) ? message._data : undefined;
  const media = isRecord(message.media) ? message.media : undefined;
  const content = stringValue(
    recordValue(message, "body", "text", "content", "caption"),
    recordValue(raw, "body", "text", "content"),
  );
  if (
    !content &&
    !stringValue(
      recordValue(media, "url", "mediaUrl"),
      recordValue(message, "mediaUrl", "media_url"),
    )
  )
    return null;

  const chatId = phoneFromCandidates(
    recordValue(sender, "wid", "userId", "id", "phone", "number"),
    recordValue(messageData, "from", "author", "chatId", "chat_id"),
    recordValue(chat, "id", "chatId", "wid"),
    recordValue(message, "from", "author", "chatId", "chat_id"),
    recordValue(raw, "from", "chatId", "chat_id"),
  );
  const senderPhone = phoneFrom(
    recordValue(message, "senderPhone", "sender_phone"),
  ) ?? phoneFrom(recordValue(messageData, "senderPhone", "sender_phone"));
  const phone = senderPhone ?? (chatId && /@(?:c|g)\.us$/i.test(chatId) ? chatId : undefined);
  const name = stringValue(
    recordValue(sender, "pushname", "pushName", "name", "formattedName"),
    recordValue(message, "notifyName", "notify_name", "pushname", "pushName", "name"),
    recordValue(messageData, "notifyName", "notify_name", "pushname", "pushName", "name"),
    recordValue(chat, "name", "formattedName"),
    recordValue(raw, "notifyName", "notify_name", "name"),
  );
  const mediaUrl = stringValue(
    recordValue(media, "url", "mediaUrl"),
    recordValue(message, "mediaUrl", "media_url", "url"),
    recordValue(raw, "mediaUrl", "media_url"),
  );
  const sessionId = stringValue(
    session,
    recordValue(raw, "sessionId", "session_id"),
    recordValue(message, "sessionId", "session_id"),
  );
  return {
    eventName,
    phone,
    name,
    content: content ?? "(media)",
    ...(mediaUrl ? { media_url: mediaUrl } : {}),
    ...(chatId ? { chat_id: chatId } : {}),
    ...(chatId ? { session_id: `wa:${chatId}` } : sessionId ? { session_id: sessionId } : {}),
    ...(sessionId ? { openwa_session_id: sessionId } : {}),
  };
}

async function logEvent(params: {
  payload?: unknown;
  payloadText?: string;
  headers: JsonRecord;
  requestId: string;
  eventName?: string;
  normalized?: NormalizedMessage | null;
  status: string;
  error?: string;
  receivedAt: string;
  method?: string;
  url?: string;
}): Promise<boolean> {
  const payloadText = params.payloadText?.slice(0, MAX_TEXT_BYTES);
  const serialized = params.payload ? JSON.stringify(params.payload) : (payloadText ?? "");
  const payload =
    serialized.length <= MAX_LOG_BYTES ? (params.payload ?? null) : { truncated: true };
  const baseRow = {
    source: "openwa",
    request_id: params.requestId,
    event_name: params.eventName ?? null,
    headers: params.headers,
    payload,
    payload_text: payloadText ?? null,
    normalized: params.normalized ?? null,
    status: params.status,
    error: params.error ?? null,
    received_at: params.receivedAt,
    processed_at: new Date().toISOString(),
  };
  const rowWithRequestMetadata = {
    ...baseRow,
    method: params.method ?? "POST",
    url: params.url ?? null,
  };

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const firstAttempt = await supabaseAdmin
      .from("webhook_events")
      .insert(rowWithRequestMetadata as never);
    if (!firstAttempt.error) return true;

    const firstError = describeError(firstAttempt.error);
    console.error("[openwa-webhook] diagnostic insert failed", {
      requestId: params.requestId,
      status: params.status,
      error: firstError,
    });

    // Older deployments may have the original table without method/url. Retry
    // with only the original columns so the raw event is still persisted.
    const fallbackAttempt = await supabaseAdmin.from("webhook_events").insert(baseRow as never);
    if (!fallbackAttempt.error) {
      console.warn("[openwa-webhook] diagnostic insert succeeded using legacy schema", {
        requestId: params.requestId,
      });
      return true;
    }

    console.error("[openwa-webhook] diagnostic fallback insert failed", {
      requestId: params.requestId,
      error: describeError(fallbackAttempt.error),
    });
    return false;
  } catch (error) {
    console.error("[openwa-webhook] diagnostic logging failed", {
      requestId: params.requestId,
      error: describeError(error),
    });
    return false;
  }
}

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers":
              "content-type, authorization, x-api-key, x-openwa-signature",
          },
        }),
      POST: async ({ request }) => {
        let requestId = request.headers.get("x-openwa-delivery-id") ?? "unknown";
        let receivedAt = new Date().toISOString();
        let headers: JsonRecord = {};
        let rawBody = "";
        const requestLog = (params: Parameters<typeof logEvent>[0]) =>
          logEvent({ ...params, method: request.method, url: request.url });

        try {
          requestId = request.headers.get("x-openwa-delivery-id") ?? crypto.randomUUID();
          receivedAt = new Date().toISOString();
          headers = headerSnapshot(request);
          rawBody = await request.text();

          if (!verifyWebhookApiKey(request) || !(await verifyWebhookSecret(request, rawBody))) {
            await requestLog({
              headers,
              requestId,
              payloadText: rawBody,
              status: "unauthorized",
              error: "OpenWA authentication failed",
              receivedAt,
            });
            return json({ ok: false, error: "Unauthorized" }, 401);
          }

          let raw: unknown;
          try {
            raw = JSON.parse(rawBody);
          } catch {
            await requestLog({
              headers,
              requestId,
              payloadText: rawBody,
              status: "error",
              error: "Invalid JSON body",
              receivedAt,
            });
            return json({
              ok: true,
              received: true,
              processed: false,
              error: "Invalid JSON body",
              request_id: requestId,
            });
          }
          if (!isRecord(raw)) {
            await requestLog({
              headers,
              requestId,
              payload: raw,
              status: "error",
              error: "Expected a JSON object",
              receivedAt,
            });
            return json({
              ok: true,
              received: true,
              processed: false,
              error: "Expected a JSON object",
              request_id: requestId,
            });
          }

          const normalized = normalizeInbound(raw);
          if (!normalized) {
            await requestLog({
              headers,
              requestId,
              payload: raw,
              eventName: stringValue(raw.event, raw.type, raw.eventName),
              normalized: null,
              status: "ignored",
              receivedAt,
            });
            return json({ ok: true, ignored: true, request_id: requestId });
          }

          const upstream = await handleAgentWebhookRequest(
            new Request(request.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone: normalized.phone,
                chat_id: normalized.chat_id,
                name: normalized.name,
                content: normalized.content,
                media_url: normalized.media_url,
                session_id: normalized.session_id,
                openwa_session_id: recordValue(raw, "sessionId", "session_id", "session") ?? undefined,
              }),
            }),
          );
          const responseText = await upstream.text();
          await requestLog({
            headers,
            requestId,
            payload: raw,
            eventName: normalized.eventName,
            normalized,
            status: upstream.ok ? "processed" : "error",
            error: upstream.ok ? undefined : responseText.slice(0, 1000),
            receivedAt,
          });
          if (!upstream.ok) {
            return json({
              ok: true,
              received: true,
              processed: false,
              error: "Webhook received but CRM processing failed",
              request_id: requestId,
            });
          }

          return new Response(responseText, {
            status: upstream.status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("[openwa-webhook] processing failed", error);
          await requestLog({
            headers,
            requestId,
            payloadText: rawBody,
            status: "error",
            error: message.slice(0, 2_000),
            receivedAt,
          });
          return json({
            ok: true,
            received: true,
            processed: false,
            error: "Webhook received but processing failed",
            request_id: requestId,
          });
        }
      },
    },
  },
});
