import { getRuntimeEnv } from "@/integrations/supabase/config";

export type MetaSendResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: string };

const GRAPH_VERSION = "v26.0";

function config() {
  return {
    accessToken: getRuntimeEnv("META_ACCESS_TOKEN")?.trim(),
    phoneNumberId: getRuntimeEnv("META_PHONE_NUMBER_ID")?.trim(),
    wabaId: getRuntimeEnv("META_WABA_ID")?.trim(),
  };
}

export function normalizeMetaPhone(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function endpoint(phoneNumberId: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;
}

async function sendPayload(payload: unknown): Promise<MetaSendResult> {
  const { accessToken, phoneNumberId } = config();
  if (!accessToken || !phoneNumberId) {
    console.error("[meta-whatsapp] send blocked: production Meta credentials are missing", {
      hasAccessToken: Boolean(accessToken),
      accessTokenLength: accessToken?.length ?? 0,
      hasPhoneNumberId: Boolean(phoneNumberId),
      phoneNumberIdLength: phoneNumberId?.length ?? 0,
    });
    return { sent: false, reason: "meta_not_configured" };
  }
  console.info("[meta-whatsapp] send attempt", {
    phoneNumberIdSuffix: phoneNumberId.slice(-4),
    accessTokenLength: accessToken.length,
    accessTokenSuffix: accessToken.slice(-4),
  });
  try {
    const response = await fetch(endpoint(phoneNumberId), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      console.error("[meta-whatsapp] send rejected", { status: response.status, body: text.slice(0, 500) });
      return { sent: false, reason: `meta_http_${response.status}: ${text.replace(/\s+/g, " ").slice(0, 500)}` };
    }
    const body = JSON.parse(text || "{}") as { messages?: Array<{ id?: string }> };
    return { sent: true, messageId: body.messages?.[0]?.id };
  } catch (error) {
    console.error("[meta-whatsapp] send failed", { error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "meta_network_error" };
  }
}

const base = (to: string) => ({ messaging_product: "whatsapp", recipient_type: "individual", to });

export function getMetaConfigStatus() {
  const { accessToken, phoneNumberId, wabaId } = config();
  return { hasAccessToken: Boolean(accessToken), hasPhoneNumberId: Boolean(phoneNumberId), hasWabaId: Boolean(wabaId), graphVersion: GRAPH_VERSION };
}

export function sendWhatsAppText(params: { phone: unknown; text: string }) {
  const to = normalizeMetaPhone(params.phone);
  if (!to) return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({ ...base(to), type: "text", text: { preview_url: false, body: params.text } });
}

export function sendWhatsAppImage(params: { phone: unknown; url: string; caption?: string }) {
  const to = normalizeMetaPhone(params.phone);
  if (!to) return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({ ...base(to), type: "image", image: { link: params.url, caption: params.caption ?? "" } });
}

export function sendWhatsAppButtons(params: { phone: unknown; body: string; buttons: Array<{ id: string; title: string }> }) {
  const to = normalizeMetaPhone(params.phone);
  if (!to) return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({
    ...base(to), type: "interactive", interactive: {
      type: "button", body: { text: params.body },
      action: { buttons: params.buttons.slice(0, 3).map((button) => ({ type: "reply", reply: button })) },
    },
  });
}

export function sendWhatsAppList(params: { phone: unknown; body: string; button: string; sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }> }) {
  const to = normalizeMetaPhone(params.phone);
  if (!to) return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({ ...base(to), type: "interactive", interactive: { type: "list", body: { text: params.body }, action: { button: params.button.slice(0, 20), sections: params.sections } } });
}
