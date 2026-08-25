/** Outbound routing for human replies sent from the CRM. */
export async function routeOutbound(params: {
  phone: string | null;
  name: string;
  content: string;
  leadId: string;
  sessionId?: string | null;
}): Promise<{ routed: boolean; channel: string; reason?: string }> {
  const { sendWhatsAppText } = await import("@/lib/meta-whatsapp.server");
  const result = await sendWhatsAppText({ phone: params.phone, text: params.content });
  if (result.sent) return { routed: true, channel: "meta_whatsapp" };
  return { routed: false, channel: "meta_whatsapp", reason: result.reason };
}
