import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * AI communication engine webhook.
 *
 * POST /api/public/agent-webhook
 * { "phone": "+44...", "name": "Jane", "content": "hi", "media_url": "https://..." }
 *
 * 1. Upserts the lead + logs the inbound message into the CRM.
 * 2. Asks Gemini Flash for a natural reply using the conversation history.
 * 3. Logs the reply back as an `ai_agent` message.
 * 4. Alerts the team on Telegram when a human handoff is needed.
 */
export const Route = createFileRoute("/api/public/agent-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleWebhook(request),
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
    },
  },
});

const CRM_BASE = "https://servicevch.lovable.app";

const bodySchema = z.object({
  phone: z.string().trim().min(3).max(40).optional(),
  name: z.string().trim().max(120).optional(),
  content: z.string().trim().min(1).max(5000),
  media_url: z.string().trim().url().max(1000).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Turn = { sender: string; content: string };

/** Ask Gemini Flash for a reply + whether a human should take over. */
async function generateReply(history: Turn[], latest: string, hasMedia: boolean) {
  const geminiKey = process.env["GEMINI_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];

  const system =
    "You are the WhatsApp assistant for Virtual Car Hire (VCH), a UK PCO/private-hire car rental company. " +
    "Reply naturally and briefly (max 3 short sentences), friendly and professional, UK English, £ for prices. " +
    "Help with availability, pricing, rental terms, servicing and MOT questions. " +
    "Never invent specific prices, dates or vehicle availability you were not given — offer to check instead. " +
    'Respond ONLY with JSON: {"reply": string, "needs_human": boolean, "reason": string}. ' +
    "Set needs_human true if the customer asks for a person/manager, is complaining or upset, reports an accident, " +
    "damage, breakdown, insurance, legal or payment/refund dispute, or if you cannot confidently help.";

  const convo = history
    .slice(-10)
    .map((m) => `${m.sender === "ai_agent" ? "Agent" : "Customer"}: ${m.content}`)
    .join("\n");
  const userText =
    (convo ? `Conversation so far:\n${convo}\n\n` : "") +
    `New customer message: ${latest}` +
    (hasMedia ? "\n(The customer also attached a photo or file.)" : "");

  const fallback = {
    reply: "Thanks for your message — one of our team will get back to you shortly.",
    needs_human: true,
    reason: "ai_unavailable",
  };

  try {
    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: userText }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
      );
      if (!res.ok) {
        console.error("[agent-webhook] Gemini error", res.status, await res.text());
        return fallback;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return { ...fallback, ...JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}") };
    }

    if (!lovableKey) return fallback;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "agent_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "needs_human", "reason"],
              properties: {
                reply: { type: "string" },
                needs_human: { type: "boolean" },
                reason: { type: "string" },
              },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("[agent-webhook] AI gateway error", res.status, await res.text());
      return fallback;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ...fallback, ...JSON.parse(data.choices?.[0]?.message?.content ?? "{}") };
  } catch (err) {
    console.error("[agent-webhook] AI failure", err);
    return fallback;
  }
}

async function alertTeam(params: {
  name: string;
  phone: string | null;
  content: string;
  mediaUrl: string | null;
  reason: string;
  leadId: string | null;
}) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  if (!token || !chatId) {
    console.warn("[agent-webhook] Telegram alert skipped — TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set.");
    return { sent: false, reason: "not_configured" };
  }

  const handoffLink = `${CRM_BASE}/whatsapp-leads${params.leadId ? `?lead=${params.leadId}` : ""}`;
  const text =
    `🚨 <b>Human handoff needed</b>\n\n` +
    `<b>Customer:</b> ${escapeHtml(params.name)}\n` +
    (params.phone ? `<b>Phone:</b> ${escapeHtml(params.phone)}\n` : "") +
    `<b>Reason:</b> ${escapeHtml(params.reason)}\n\n` +
    `<b>Message:</b>\n${escapeHtml(params.content).slice(0, 900)}\n` +
    (params.mediaUrl ? `\n<b>Media:</b> ${escapeHtml(params.mediaUrl)}\n` : "") +
    `\n<a href="${handoffLink}">Take over in the CRM →</a>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn("[agent-webhook] Telegram sendMessage failed", res.status, await res.text());
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[agent-webhook] Telegram error", err);
    return { sent: false, reason: "network_error" };
  }
}

async function handleWebhook(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" }, 400);
  }
  const { content, media_url } = parsed.data;
  const phone = parsed.data.phone ?? null;
  const name = parsed.data.name || "Unknown";
  const mediaUrl = media_url ?? null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Everything is filed against the fleet owner account.
  const { data: owner } = await supabaseAdmin.from("vehicles").select("user_id").limit(1).maybeSingle();
  const userId = owner?.user_id;
  if (!userId) return json({ ok: false, error: "No fleet owner account found" }, 500);

  // Find an existing open lead for this phone number, otherwise create one.
  let leadId: string | null = null;
  let aiPaused = false;
  if (phone) {
    const { data: existing } = await supabaseAdmin
      .from("whatsapp_leads")
      .select("id, ai_paused")
      .eq("user_id", userId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
    aiPaused = Boolean((existing as { ai_paused?: boolean } | null)?.ai_paused);
  }

  if (leadId) {
    await supabaseAdmin
      .from("whatsapp_leads")
      .update({ last_message_at: new Date().toISOString(), ...(mediaUrl ? { media_url: mediaUrl } : {}) })
      .eq("id", leadId);
  } else {
    const { data: created, error: leadErr } = await supabaseAdmin
      .from("whatsapp_leads")
      .insert({
        user_id: userId,
        contact_name: name,
        phone,
        message: content,
        media_url: mediaUrl,
        status: "new",
      })
      .select("id")
      .single();
    if (leadErr) return json({ ok: false, error: leadErr.message }, 500);
    leadId = created.id;
  }

  // Prior conversation for context.
  const { data: history } = await supabaseAdmin
    .from("messages")
    .select("sender, content")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(20);

  const { error: inboundErr } = await supabaseAdmin.from("messages").insert({
    user_id: userId,
    lead_id: leadId,
    sender: "customer",
    content,
    media_url: mediaUrl,
  });
  if (inboundErr) return json({ ok: false, error: inboundErr.message }, 500);

  // A human has taken over this conversation — never auto-reply.
  if (aiPaused) {
    await supabaseAdmin
      .from("whatsapp_leads")
      .update({ status: "human" } as never)
      .eq("id", leadId);
    return json({ ok: true, lead_id: leadId, ai_paused: true, reply: null, needs_human: true });
  }

  // Menu selections: [1] Rent a Car, [2] Report an Accident, [3] Speak to Human.
  const option = parseMenuOption(content);
  if (option === 3) {
    const reply = "No problem — I'm connecting you with a member of our team now. They'll reply here shortly.";
    await supabaseAdmin.from("messages").insert({
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: reply,
      handoff: true,
    });
    await supabaseAdmin
      .from("whatsapp_leads")
      .update({ ai_summary: reply, status: "needs_human", ai_paused: true, intent: "speak_to_human" } as never)
      .eq("id", leadId);
    const menuAlert = await alertTeam({
      name,
      phone,
      content,
      mediaUrl,
      reason: "Customer chose [3] Speak to Human",
      leadId,
    });
    return json({ ok: true, lead_id: leadId, reply, needs_human: true, telegram_alert: menuAlert });
  }

  if (option === 1 || option === 2) {
    await supabaseAdmin
      .from("whatsapp_leads")
      .update({ intent: option === 1 ? "rent_a_car" : "report_accident" } as never)
      .eq("id", leadId);
  }

  const latest =
    option === 1
      ? `${content}\n(Menu selection: [1] Rent a Car — help them with availability and pricing next steps.)`
      : option === 2
        ? `${content}\n(Menu selection: [2] Report an Accident — gather registration, date, location and what happened.)`
        : content;

  const ai = await generateReply((history ?? []) as Turn[], latest, Boolean(mediaUrl));


  await supabaseAdmin.from("messages").insert({
    user_id: userId,
    lead_id: leadId,
    sender: "ai_agent",
    content: ai.reply,
    handoff: Boolean(ai.needs_human),
  });

  await supabaseAdmin
    .from("whatsapp_leads")
    .update({
      ai_summary: ai.reply,
      ...(ai.needs_human ? { status: "needs_human" } : {}),
    })
    .eq("id", leadId);

  let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
  if (ai.needs_human) {
    alert = await alertTeam({
      name,
      phone,
      content,
      mediaUrl,
      reason: ai.reason || "Customer requested a human",
      leadId,
    });
  }

  return json({
    ok: true,
    lead_id: leadId,
    reply: ai.reply,
    needs_human: Boolean(ai.needs_human),
    telegram_alert: alert,
  });
}
