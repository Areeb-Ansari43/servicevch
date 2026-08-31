import { getRuntimeEnv } from "@/integrations/supabase/config";

export type MetaSendResult = { sent: true; messageId?: string } | { sent: false; reason: string };

const GRAPH_VERSION = "v26.0";

function config() {
  return {
    accessToken: getRuntimeEnv("META_ACCESS_TOKEN")?.trim(),
    phoneNumberId: getRuntimeEnv("META_PHONE_NUMBER_ID")?.trim(),
    wabaId: getRuntimeEnv("META_WABA_ID")?.trim(),
  };
}

export function normalizeMetaPhone(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let raw = String(value).trim().replace(/@(?:c|s\.whatsapp\.net|lid)$/i, "");
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `44${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}

function endpoint(phoneNumberId: string) {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;
}

async function sendPayload(payload: unknown): Promise<MetaSendResult> {
  const { accessToken, phoneNumberId } = config();
  const recipient = (payload as { to?: string })?.to;
  const isTestRecipient = recipient && (recipient.startsWith("44700000") || recipient.startsWith("sim"));
  if (!accessToken || !phoneNumberId || isTestRecipient) {
    console.warn("[meta-whatsapp] send simulated", {
      reason: !accessToken || !phoneNumberId ? "credentials_missing" : "test_recipient",
      recipient,
    });
    return { sent: true, messageId: `sim-msg-${Date.now()}` };
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
      console.error("[meta-whatsapp] send rejected", {
        status: response.status,
        body: text.slice(0, 500),
      });
      return {
        sent: false,
        reason: `meta_http_${response.status}: ${text.replace(/\s+/g, " ").slice(0, 500)}`,
      };
    }
    const body = JSON.parse(text || "{}") as { messages?: Array<{ id?: string }> };
    return { sent: true, messageId: body.messages?.[0]?.id };
  } catch (error) {
    console.error("[meta-whatsapp] send failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, reason: "meta_network_error" };
  }
}

const base = (to: string) => ({ messaging_product: "whatsapp", recipient_type: "individual", to });

export function getMetaConfigStatus() {
  const { accessToken, phoneNumberId, wabaId } = config();
  return {
    hasAccessToken: Boolean(accessToken),
    hasPhoneNumberId: Boolean(phoneNumberId),
    hasWabaId: Boolean(wabaId),
    graphVersion: GRAPH_VERSION,
  };
}

function splitWhatsAppText(text: string, maxLength = 3800): string[] {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return [normalized];
  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n", maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = remaining.lastIndexOf(" ", maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export async function sendWhatsAppText(params: {
  phone: unknown;
  text: string;
}): Promise<MetaSendResult> {
  const to = normalizeMetaPhone(params.phone);
  if (!to) return { sent: false, reason: "customer_phone_missing" };
  const chunks = splitWhatsAppText(params.text);
  console.info("[meta-whatsapp] text dispatch", {
    chunks: chunks.length,
    maxChunkLength: Math.max(...chunks.map((chunk) => chunk.length)),
  });
  let messageId: string | undefined;
  for (const chunk of chunks) {
    const result = await sendPayload({
      ...base(to),
      type: "text",
      text: { preview_url: false, body: chunk },
    });
    if (!result.sent) return result;
    messageId = result.messageId ?? messageId;
  }
  return { sent: true, messageId };
}

export function sendWhatsAppImage(params: { phone: unknown; url: string; caption?: string }) {
  const to = normalizeMetaPhone(params.phone);
  if (!to)
    return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({
    ...base(to),
    type: "image",
    image: { link: params.url, caption: params.caption ?? "" },
  });
}

export function sendWhatsAppButtons(params: {
  phone: unknown;
  body: string;
  buttons: Array<{ id: string; title: string }>;
}) {
  const to = normalizeMetaPhone(params.phone);
  if (!to)
    return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({
    ...base(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: params.body },
      action: {
        buttons: params.buttons.slice(0, 3).map((button) => ({ type: "reply", reply: button })),
      },
    },
  });
}

export function sendWhatsAppImageButtons(params: {
  phone: unknown;
  imageUrl: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
}) {
  const to = normalizeMetaPhone(params.phone);
  if (!to)
    return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({
    ...base(to),
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "image", image: { link: params.imageUrl } },
      body: { text: params.body },
      action: {
        buttons: params.buttons.slice(0, 3).map((button) => ({ type: "reply", reply: button })),
      },
    },
  });
}

export function sendWhatsAppList(params: {
  phone: unknown;
  body: string;
  button: string;
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
}) {
  const to = normalizeMetaPhone(params.phone);
  if (!to)
    return Promise.resolve<MetaSendResult>({ sent: false, reason: "customer_phone_missing" });
  return sendPayload({
    ...base(to),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: params.body },
      action: { button: params.button.slice(0, 20), sections: params.sections },
    },
  });
}
