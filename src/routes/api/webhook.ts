import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { handleAgentWebhookRequest } from "./public/agent-webhook";

type JsonRecord = Record<string, any>;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" } });

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function validMetaSignature(request: Request, body: string) {
  const appSecret = getRuntimeEnv("META_APP_SECRET")?.trim();
  if (!appSecret) return true;
  const header = request.headers.get("x-hub-signature-256") ?? "";
  if (!header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return constantTimeEqual(header.slice(7), hex);
}

function redactHeaders(request: Request) {
  const headers: JsonRecord = {};
  request.headers.forEach((value, key) => { headers[key] = /authorization|signature|token|secret|api-key/i.test(key) ? "[redacted]" : value.slice(0, 300); });
  return headers;
}

function normalizePhone(value: unknown) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return digits.length >= 8 ? digits : undefined;
}

function extractMessages(payload: JsonRecord) {
  const output: Array<{ message: JsonRecord; value: JsonRecord }> = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value;
      if (!value || !Array.isArray(value.messages)) continue;
      for (const message of value.messages) output.push({ message, value });
    }
  }
  return output;
}

function normalizeMetaMessage(message: JsonRecord, value: JsonRecord) {
  const contact = Array.isArray(value.contacts) ? value.contacts.find((item: JsonRecord) => item.wa_id === message.from) ?? value.contacts[0] : undefined;
  const profileName = contact?.profile?.name;
  const interactive = message.interactive;
  let content = "";
  if (message.type === "text") content = String(message.text?.body ?? "");
  else if (message.type === "interactive") {
    const reply = interactive?.button_reply ?? interactive?.list_reply;
    content = String(reply?.id ?? reply?.title ?? "");
  } else if (message.type === "image") content = String(message.image?.caption ?? "(image)");
  else if (message.type === "video") content = String(message.video?.caption ?? "(video)");
  else if (message.type === "document") content = String(message.document?.caption ?? "(document)");
  else content = `(${message.type ?? "media"})`;
  const mediaId = message.image?.id ?? message.video?.id ?? message.document?.id ?? message.audio?.id;
  return {
    eventName: "messages.received",
    phone: normalizePhone(message.from),
    chat_id: normalizePhone(message.from),
    name: typeof profileName === "string" ? profileName : undefined,
    content: content.trim() || "(media)",
    ...(mediaId ? { media_url: `https://graph.facebook.com/${encodeURIComponent(mediaId)}` } : {}),
    session_id: `meta:${message.from}`,
  };
}

async function logMetaEvent(params: { payload: unknown; request: Request; status: string; error?: string; normalized?: unknown; requestId: string }) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("webhook_events").insert({
      source: "meta_whatsapp",
      request_id: params.requestId,
      event_name: "messages",
      headers: redactHeaders(params.request),
      payload: params.payload,
      normalized: params.normalized ?? null,
      status: params.status,
      error: params.error ?? null,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    } as never);
  } catch (error) {
    console.error("[meta-webhook] event logging failed", { requestId: params.requestId, error: error instanceof Error ? error.message : String(error) });
  }
}

export const Route = createFileRoute("/api/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token") ?? "";
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        const expected = getRuntimeEnv("META_WEBHOOK_VERIFY_TOKEN")?.trim() ?? "";
        if (mode === "subscribe" && expected && constantTimeEqual(token, expected)) return text(challenge, 200);
        return text("Forbidden", 403);
      },
      OPTIONS: async () => new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, x-hub-signature-256" } }),
      POST: async ({ request }) => {
        const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
        const rawBody = await request.text();
        let payload: JsonRecord;
        try { payload = JSON.parse(rawBody); } catch { await logMetaEvent({ payload: rawBody.slice(0, 20000), request, status: "error", error: "Invalid JSON", requestId }); return json({ ok: true, received: true }, 200); }
        if (!(await validMetaSignature(request, rawBody))) {
          await logMetaEvent({ payload, request, status: "unauthorized", error: "Meta signature validation failed", requestId });
          return json({ ok: false, error: "Unauthorized" }, 403);
        }
        const messages = extractMessages(payload);
        await logMetaEvent({ payload, request, status: "received", normalized: messages.map(({ message, value }) => normalizeMetaMessage(message, value)), requestId });
        for (const { message, value } of messages) {
          const normalized = normalizeMetaMessage(message, value);
          if (!normalized.phone) continue;
          try {
            const response = await handleAgentWebhookRequest(new Request("https://servicevch.pages.dev/api/public/agent-webhook", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) }));
            if (!response.ok) console.error("[meta-webhook] agent processing returned non-2xx", { requestId, status: response.status });
          } catch (error) {
            console.error("[meta-webhook] agent processing failed", { requestId, error: error instanceof Error ? error.message : String(error) });
          }
        }
        await logMetaEvent({ payload, request, status: "processed", normalized: messages.map(({ message, value }) => normalizeMetaMessage(message, value)), requestId });
        return json({ ok: true, received: true, processed: messages.length }, 200);
      },
    },
  },
});
