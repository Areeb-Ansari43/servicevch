/**
 * Outbound routing for human replies sent from the CRM.
 * Degrades gracefully when no outbound channel is configured.
 */
export async function routeOutbound(params: {
  phone: string | null;
  name: string;
  content: string;
  leadId: string;
}): Promise<{ routed: boolean; channel: string; reason?: string }> {
  const url = process.env["OUTBOUND_WEBHOOK_URL"];
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env["OUTBOUND_WEBHOOK_SECRET"]
            ? { "X-Webhook-Secret": process.env["OUTBOUND_WEBHOOK_SECRET"] as string }
            : {}),
        },
        body: JSON.stringify({
          to: params.phone,
          name: params.name,
          text: params.content,
          lead_id: params.leadId,
          sender: "human",
        }),
      });
      if (!res.ok) {
        console.warn("[chat] outbound webhook failed", res.status);
        return { routed: false, channel: "webhook", reason: `http_${res.status}` };
      }
      return { routed: true, channel: "webhook" };
    } catch (err) {
      console.warn("[chat] outbound webhook error", err);
      return { routed: false, channel: "webhook", reason: "network_error" };
    }
  }

  const { sendTelegramAlert } = await import("@/lib/telegram.server");
  const sent = await sendTelegramAlert(
    `💬 <b>Human reply sent</b>\n<b>To:</b> ${params.name}${params.phone ? ` (${params.phone})` : ""}\n\n${params.content}`,
  );
  return sent.sent
    ? { routed: true, channel: "telegram" }
    : { routed: false, channel: "telegram", reason: sent.reason };
}
