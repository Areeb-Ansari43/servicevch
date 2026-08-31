import { createFileRoute } from "@tanstack/react-router";

import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText } from "@/lib/meta-whatsapp.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chatIdFromLead(lead: Record<string, unknown>): string | null {
  const session = typeof lead.session_id === "string" ? lead.session_id : "";
  if (session.startsWith("meta:")) return session.slice(5);
  return typeof lead.phone === "string" ? lead.phone : null;
}

async function sendTelegramClosureAlert(params: {
  lead: Record<string, unknown>;
  transcript: string;
}): Promise<boolean> {
  const token = getRuntimeEnv("TELEGRAM_BOT_TOKEN")?.trim();
  const chatId = getRuntimeEnv("TELEGRAM_CHAT_ID")?.trim();
  if (!token || !chatId) {
    console.error("[inactivity-job] Telegram is not configured", {
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    });
    return false;
  }
  const name = typeof params.lead.contact_name === "string" ? params.lead.contact_name : "Unknown";
  const phone = typeof params.lead.phone === "string" ? params.lead.phone : "No number";
  const leadId = typeof params.lead.id === "string" ? params.lead.id : "";
  const text =
    "✅ <b>Conversation closed after inactivity</b>\n\n" +
    `<b>Customer:</b> ${escapeHtml(name)}\n` +
    `<b>Phone:</b> ${escapeHtml(phone)}\n` +
    "<b>Reason:</b> Customer did not respond to the follow-up\n\n" +
    `<b>Complete conversation:</b>\n${escapeHtml(params.transcript).slice(0, 6000)}\n\n` +
    `<a href=\"https://servicevch.pages.dev/whatsapp-leads?lead=${encodeURIComponent(leadId)}\">Open in CRM →</a>`;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );
    if (!response.ok)
      console.error("[inactivity-job] Telegram alert failed", {
        status: response.status,
        body: await response.text(),
      });
    return response.ok;
  } catch (error) {
    console.error("[inactivity-job] Telegram request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export const Route = createFileRoute("/api/jobs/inactivity")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = getRuntimeEnv("INACTIVITY_JOB_SECRET")?.trim();
        const provided = request.headers.get("x-inactivity-job-secret")?.trim();
        if (!expected || !provided || expected !== provided)
          return json({ ok: false, error: "Unauthorized" }, 401);

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const now = Date.now();
        const fiveMinutesAgo = new Date(now - 5 * 60_000).toISOString();
        const thirtyMinutesAgo = new Date(now - 30 * 60_000).toISOString();
        const { data: leads, error } = await (db.from("whatsapp_leads") as any)
          .select(
            "id, user_id, contact_name, phone, session_id, status, ai_paused, last_message_at, inactivity_prompted_at, inactivity_alerted_at",
          )
          .eq("ai_paused", false)
          .neq("status", "closed")
          .not("last_message_at", "is", null)
          .limit(100);
        if (error) return json({ ok: false, error: error.message }, 500);

        let prompted = 0;
        let closed = 0;
        for (const lead of (leads ?? []) as Record<string, unknown>[]) {
          const leadId = typeof lead.id === "string" ? lead.id : "";
          const chatId = chatIdFromLead(lead);
          if (!leadId || !chatId) continue;
          if (lead.inactivity_alerted_at) continue;
          const promptedAt =
            typeof lead.inactivity_prompted_at === "string" ? lead.inactivity_prompted_at : null;
          const lastMessageAt =
            typeof lead.last_message_at === "string" ? new Date(lead.last_message_at).getTime() : 0;
          // Never sweep up dormant historical leads after a deployment. Only a lead
          // that was active within the last 30 minutes can enter this workflow.
          if (lastMessageAt < new Date(thirtyMinutesAgo).getTime()) continue;
          if (!promptedAt && lastMessageAt <= new Date(fiveMinutesAgo).getTime()) {
            // Claim the prompt before sending it. Multiple cron invocations can overlap;
            // the conditional update ensures only one invocation sends the follow-up.
            const claimedAt = new Date().toISOString();
            const { data: claim } = await (db.from("whatsapp_leads") as any)
              .update({ inactivity_prompted_at: claimedAt })
              .eq("id", leadId)
              .is("inactivity_prompted_at", null)
              .select("id")
              .maybeSingle();
            if (!claim) continue;
            const outbound = await sendWhatsAppText({
              phone: chatId,
              text: "Are you there?",
            });
            if (outbound.sent) {
              await db
                .from("messages")
                .insert({
                  user_id: lead.user_id,
                  lead_id: leadId,
                  sender: "ai_agent",
                  content: "Are you there?",
                } as never);
              prompted += 1;
            } else {
              // Allow a later run to retry if the WhatsApp send itself failed.
              await (db.from("whatsapp_leads") as any)
                .update({ inactivity_prompted_at: null })
                .eq("id", leadId)
                .eq("inactivity_prompted_at", claimedAt);
            }
            continue;
          }
          if (!promptedAt) continue;
          const promptedAtMs = new Date(promptedAt).getTime();
          if (promptedAtMs > now - 5 * 60_000) continue;
          const lastMessage = lastMessageAt;
          if (lastMessage > promptedAtMs) continue;
          const { data: messages } = await db
            .from("messages")
            .select("sender, content")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: true })
            .limit(100);
          const transcript = ((messages ?? []) as { sender?: string; content?: string }[])
            .map((message) => `${message.sender ?? "unknown"}: ${message.content ?? ""}`)
            .join("\n");
          const closureClaim = await (db.from("whatsapp_leads") as any)
            .update({
              status: "closed",
              ai_paused: true,
              closed_at: new Date().toISOString(),
              inactivity_alerted_at: new Date().toISOString(),
            })
            .eq("id", leadId)
            .eq("inactivity_prompted_at", promptedAt)
            .is("inactivity_alerted_at", null)
            .lte("last_message_at", promptedAt)
            .select("id")
            .maybeSingle();
          if (!closureClaim?.data) continue;
          await sendWhatsAppText({
            phone: chatId,
            text: "This conversation has been closed due to inactivity. If you need further assistance, please reply to start a new chat.",
          });
          await db
            .from("messages")
            .insert({
              user_id: lead.user_id,
              lead_id: leadId,
              sender: "ai_agent",
              content:
                "This conversation has been closed due to inactivity. If you need further assistance, please reply to start a new chat.",
            } as never);
          const alerted = await sendTelegramClosureAlert({ lead, transcript });
          if (alerted) closed += 1;
        }
        return json({ ok: true, prompted, closed });
      },
    },
  },
});
