/** Outbound routing for human replies sent from the CRM. */
export async function routeOutbound(params: {
  phone: string | null;
  name: string;
  content: string;
  leadId: string;
  sessionId?: string | null;
}): Promise<{ routed: boolean; channel: string; reason?: string }> {
  const { sendOpenWaText } = await import("@/lib/openwa.server");
  const openwa = await sendOpenWaText({ phone: params.phone, text: params.content, sessionId: params.sessionId ?? undefined });
  if (openwa.sent) return { routed: true, channel: "openwa" };

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

  return { routed: false, channel: "openwa", reason: openwa.reason };
}
