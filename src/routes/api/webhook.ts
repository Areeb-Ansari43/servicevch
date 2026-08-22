import { createFileRoute } from "@tanstack/react-router";
import { handleAgentWebhookRequest } from "./public/agent-webhook";

type JsonRecord = Record<string, unknown>;
type NormalizedMessage = {
  eventName: string;
  phone?: string;
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
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/@(c|g)\.us$/i, "");
  return cleaned.length >= 3 ? cleaned : undefined;
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
  const expectedSecret = process.env["OPENWA_WEBHOOK_SECRET"];
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
  const expectedKey = process.env["OPENWA_API_KEY"];
  if (!expectedKey) return true;
  const apiKey = request.headers.get("x-api-key");
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return [apiKey, bearer].some((provided) =>
    Boolean(provided && constantTimeEqual(provided, expectedKey)),
  );
}

function unwrapPayload(raw: JsonRecord): { eventName: string; message: JsonRecord } {
  const eventName = stringValue(raw.event, raw.type, raw.eventName, raw.name) ?? "message.received";
  const data = isRecord(raw.data) ? raw.data : undefined;
  const payload = isRecord(raw.payload) ? raw.payload : undefined;
  const message = isRecord(raw.message)
    ? raw.message
    : isRecord(data?.message)
      ? data.message
      : isRecord(payload?.message)
        ? payload.message
        : (data ?? payload ?? raw);
  return { eventName, message };
}

function normalizeInbound(raw: JsonRecord): NormalizedMessage | null {
  const { eventName, message } = unwrapPayload(raw);
  const receivedFlag = raw.message && isRecord(raw.message) ? raw.message.received : undefined;
  const isInbound =
    receivedFlag === true ||
    /message[._]received/i.test(eventName) ||
    (eventName === "message" && !recordValue(message, "fromMe", "from_me", "isFromMe"));
  if (!isInbound) return null;

  const sender = isRecord(message.sender) ? message.sender : undefined;
  const chat = isRecord(message.chat) ? message.chat : undefined;
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

  const phone = phoneFrom(
    stringValue(
      recordValue(message, "from", "author", "chatId", "chat_id"),
      recordValue(chat, "id", "chatId"),
      recordValue(sender, "id", "phone", "number"),
      recordValue(raw, "from", "phone", "chatId"),
    ),
  );
  const name = stringValue(
    recordValue(sender, "pushname", "name", "formattedName"),
    recordValue(message, "notifyName", "name"),
    recordValue(raw, "name"),
  );
  const mediaUrl = stringValue(
    recordValue(media, "url", "mediaUrl"),
    recordValue(message, "mediaUrl", "media_url", "url"),
    recordValue(raw, "mediaUrl", "media_url"),
  );
  const sessionId = stringValue(
    recordValue(raw, "sessionId", "session_id"),
    recordValue(message, "sessionId", "session_id"),
  );
  return {
    eventName,
    phone,
    name,
    content: content ?? "(media)",
    ...(mediaUrl ? { media_url: mediaUrl } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
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
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payloadText = params.payloadText?.slice(0, MAX_TEXT_BYTES);
    const serialized = params.payload ? JSON.stringify(params.payload) : (payloadText ?? "");
    const payload =
      serialized.length <= MAX_LOG_BYTES ? (params.payload ?? null) : { truncated: true };
    await supabaseAdmin.from("webhook_events").insert({
      source: "openwa",
      request_id: params.requestId,
      method: params.method ?? "POST",
      url: params.url ?? null,
      event_name: params.eventName ?? null,
      headers: params.headers,
      payload,
      payload_text: payloadText ?? null,
      normalized: params.normalized ?? null,
      status: params.status,
      error: params.error ?? null,
      received_at: params.receivedAt,
      processed_at: new Date().toISOString(),
    } as never);
  } catch (error) {
    console.error("[openwa-webhook] diagnostic logging failed", error);
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
                name: normalized.name,
                content: normalized.content,
                media_url: normalized.media_url,
                session_id: normalized.session_id,
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
