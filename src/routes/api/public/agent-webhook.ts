import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendOpenWaText, WELCOME_MESSAGE } from "@/lib/openwa.server";

const CRM_BASE = "https://servicevch.pages.dev";

type Turn = { sender: string; content: string; media_url?: string | null };
type FleetVehicle = {
  reg: string;
  make: string;
  model: string;
  year: number | null;
  fuel_type: string | null;
  status: string | null;
  next_mot_date: string | null;
  pco_expiry_date: string | null;
};

type AiResult = {
  reply: string;
  needs_human: boolean;
  reason: string;
  asks_closure: boolean;
};

const bodySchema = z.object({
  phone: z.string().trim().min(3).max(40).optional(),
  name: z.string().trim().max(120).optional(),
  content: z.string().trim().min(1).max(5000),
  media_url: z.string().trim().url().max(2000).optional(),
  session_id: z.string().trim().min(8).max(160).optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function isMissingSessionColumn(error: unknown): boolean {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  return /session_id["']?\s+column|column\s+["']?session_id|schema cache/i.test(text ?? "");
}

async function insertWithSessionFallback(
  db: { from: (table: string) => any },
  table: string,
  row: Record<string, unknown>,
  select?: string,
) {
  const runInsert = (value: Record<string, unknown>) => {
    const query = db.from(table).insert(value);
    return select ? query.select(select).single() : query;
  };
  const result = await runInsert(row);
  if (result.error && "session_id" in row && isMissingSessionColumn(result.error)) {
    const { session_id: _sessionId, ...legacyRow } = row;
    console.warn(`[agent-webhook] ${table} has no session_id; using legacy insert`);
    return runInsert(legacyRow);
  }
  return result;
}

function parseMenuOption(text: string): 1 | 2 | 3 | null {
  const normalized = text.trim().toLowerCase();
  if (/^(?:option\s*)?\[?1\]?[.)]?$/.test(normalized) || normalized === "book a car") return 1;
  if (/^(?:option\s*)?\[?2\]?[.)]?$/.test(normalized) || normalized === "report accident") return 2;
  if (/^(?:option\s*)?\[?3\]?[.)]?$/.test(normalized) || normalized === "speak to human") return 3;
  return null;
}

function isPositiveClosure(text: string): boolean {
  return /^(?:yes|yeah|yep|yup|that'?s all|all good|no thanks|no thank you|that is all|that’s all)[.!\s]*$/i.test(
    text.trim(),
  );
}

function includesClosureQuestion(text: string): boolean {
  return /is that all for today\??/i.test(text);
}

function fuelCategory(value: string | null): "Electric" | "Plug-in-Hybrid" | "Petrol" {
  const fuel = (value ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (fuel.includes("electric") || fuel === "ev") return "Electric";
  if (fuel.includes("hybrid") || fuel.includes("phev") || fuel.includes("plugin"))
    return "Plug-in-Hybrid";
  return "Petrol";
}

function isAvailable(vehicle: FleetVehicle): boolean {
  const status = (vehicle.status ?? "").toLowerCase();
  return ["available", "active", "in stock"].includes(status);
}

function formatFleet(fleet: FleetVehicle[]): string {
  const available = fleet.filter(isAvailable);
  const grouped = ["Electric", "Plug-in-Hybrid", "Petrol"].map((category) => {
    const cars = available
      .filter((vehicle) => fuelCategory(vehicle.fuel_type) === category)
      .map((vehicle) => `${vehicle.make} ${vehicle.model} (${vehicle.reg})`)
      .join(", ");
    return `${category}: ${cars || "none currently available"}`;
  });
  return `Available vehicles (${available.length}/${fleet.length}; rented, in-service and off-road vehicles excluded):\n${grouped.join("\n")}`;
}

async function generateReply(
  history: Turn[],
  latest: string,
  hasMedia: boolean,
  fleet: FleetVehicle[],
): Promise<AiResult> {
  const fallback: AiResult = {
    reply:
      "I’m sorry, I’m having trouble helping with that right now. I’m connecting you with a member of our team now.",
    needs_human: true,
    reason: "ai_unavailable_or_error",
    asks_closure: false,
  };
  const system =
    "You are the WhatsApp assistant for Virtual Car Hire (VCH), a UK PCO/private-hire car rental company. " +
    "Reply naturally and briefly in UK English, maximum 4 short sentences. Use £ for prices. " +
    "Use only the supplied live fleet data: never invent availability, prices, dates, MOT or PCO information. " +
    "Treat only vehicles marked available/active/in stock as available; rented, assigned, in-service and off-road vehicles are unavailable. " +
    "If the requested car is unavailable, explicitly say so and suggest alternatives under exactly these headings: Electric, Plug-in-Hybrid, Petrol. " +
    "If you cannot safely answer, the AI service fails, or you become stuck, set needs_human true; otherwise keep needs_human false. For an accident report, gather the details for the CRM accident workflow instead of handing off immediately. " +
    "At the end of a standard interaction, ask exactly: Is that all for today? " +
    'Respond ONLY as JSON: {"reply": string, "needs_human": boolean, "reason": string, "asks_closure": boolean}. ' +
    "Set asks_closure true when the reply contains that exact question.\n\n" +
    formatFleet(fleet);
  const convo = history
    .slice(-16)
    .map((m) => `${m.sender === "ai_agent" ? "Agent" : "Customer"}: ${m.content}`)
    .join("\n");
  const userText =
    (convo ? `Conversation so far:\n${convo}\n\n` : "") +
    `New customer message: ${latest}` +
    (hasMedia ? "\nThe customer attached media; acknowledge it if relevant." : "");

  try {
    const lovableKey = getRuntimeEnv("LOVABLE_API_KEY");
    if (!lovableKey) return fallback;
    const content = hasMedia
      ? [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: history.at(-1)?.media_url ?? "" } },
        ]
      : userText;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "agent_reply",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["reply", "needs_human", "reason", "asks_closure"],
              properties: {
                reply: { type: "string" },
                needs_human: { type: "boolean" },
                reason: { type: "string" },
                asks_closure: { type: "boolean" },
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
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    const reply = typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "";
    if (!reply) return fallback;
    return {
      reply,
      needs_human: Boolean(parsed.needs_human),
      reason: typeof parsed.reason === "string" ? parsed.reason : "",
      asks_closure: Boolean(parsed.asks_closure) || includesClosureQuestion(reply),
    };
  } catch (error) {
    console.error("[agent-webhook] AI failure", error);
    return fallback;
  }
}

async function sendTelegramAlert(params: {
  name: string;
  phone: string | null;
  reason: string;
  leadId: string;
  history: Turn[];
  mediaUrl: string | null;
  closed: boolean;
}) {
  const token = getRuntimeEnv("TELEGRAM_BOT_TOKEN");
  const chatId = getRuntimeEnv("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return { sent: false, reason: "not_configured" };
  const transcript = params.history
    .slice(-20)
    .map((m) => `${m.sender}: ${m.content}`)
    .join("\n");
  const text =
    `${params.closed ? "✅ <b>Conversation closed</b>" : "🚨 <b>Human handoff needed</b>"}\n\n` +
    `<b>Customer:</b> ${escapeHtml(params.name)}\n` +
    (params.phone ? `<b>Phone:</b> ${escapeHtml(params.phone)}\n` : "") +
    `<b>Reason:</b> ${escapeHtml(params.reason)}\n` +
    (params.mediaUrl ? `<b>Media:</b> ${escapeHtml(params.mediaUrl)}\n` : "") +
    `\n<b>Complete recent conversation:</b>\n${escapeHtml(transcript).slice(0, 5000)}\n\n` +
    `<a href="${CRM_BASE}/whatsapp-leads?lead=${encodeURIComponent(params.leadId)}">Open in CRM →</a>`;
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
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    return { sent: true };
  } catch {
    return { sent: false, reason: "network_error" };
  }
}

export const Route = createFileRoute("/api/public/agent-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => handleAgentWebhookRequest(request),
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

export async function handleAgentWebhookRequest(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success)
    return json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload" }, 400);
  const { content, media_url: mediaUrl = null, session_id: sessionId = null } = parsed.data;
  const phone = parsed.data.phone ?? null;
  const suppliedName = parsed.data.name?.trim() || "";
  const name = suppliedName || "Unknown";
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const { data: owner } = await db.from("vehicles").select("user_id").limit(1).maybeSingle();
  const userId = owner?.user_id;
  if (!userId) return json({ ok: false, error: "No fleet owner account found" }, 500);

  let leadId: string | null = null;
  let isNewLead = false;
  let aiPaused = false;
  let closed = false;
  let leadName = name;
  if (sessionId) {
    const { data: existing } = await db
      .from("whatsapp_leads")
      .select("id, contact_name, ai_paused, status, closed_at")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
    aiPaused = Boolean(existing?.ai_paused);
    closed = Boolean(existing?.closed_at) || existing?.status === "closed";
    leadName = existing?.contact_name || leadName;
  } else if (phone) {
    const { data: existing } = await db
      .from("whatsapp_leads")
      .select("id, contact_name, ai_paused, status, closed_at")
      .eq("user_id", userId)
      .eq("phone", phone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
    aiPaused = Boolean(existing?.ai_paused);
    closed = Boolean(existing?.closed_at) || existing?.status === "closed";
    leadName = existing?.contact_name || leadName;
  }

  if (!leadId) {
    isNewLead = true;
    const { data: created, error } = await insertWithSessionFallback(db, "whatsapp_leads", {
      user_id: userId,
        contact_name: name,
        phone,
      message: content,
      media_url: mediaUrl,
      status: "new",
      session_id: sessionId,
    }, "id");
    if (error) return json({ ok: false, error: error.message }, 500);
    leadId = created.id;
  } else {
    await db
      .from("whatsapp_leads")
      .update({
        ...(suppliedName ? { contact_name: suppliedName } : {}),
        last_message_at: new Date().toISOString(),
        ...(mediaUrl ? { media_url: mediaUrl } : {}),
      } as never)
      .eq("id", leadId);
  }

  if (!leadId) return json({ ok: false, error: "Lead could not be created" }, 500);

  const { data: oldHistory } = await db
    .from("messages")
    .select("sender, content, media_url")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true })
    .limit(40);
  const inbound: Turn = { sender: "customer", content, media_url: mediaUrl };
  const { error: inboundError } = await insertWithSessionFallback(db, "messages", {
    user_id: userId,
    lead_id: leadId,
    sender: "customer",
    content,
    media_url: mediaUrl,
    session_id: sessionId,
  });
  if (inboundError) return json({ ok: false, error: inboundError.message }, 500);
  const history = [...((oldHistory ?? []) as Turn[]), inbound];

  if (closed || aiPaused) {
    if (closed)
      return json({ ok: true, lead_id: leadId, closed: true, reply: null, needs_human: false });
    await db
      .from("whatsapp_leads")
      .update({ status: "human" } as never)
      .eq("id", leadId);
    return json({ ok: true, lead_id: leadId, ai_paused: true, reply: null, needs_human: true });
  }

  const option = parseMenuOption(content);
  if (isNewLead && !option) {
    await insertWithSessionFallback(db, "messages", {
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: WELCOME_MESSAGE,
      session_id: sessionId,
    });
    const outbound = await sendOpenWaText({ phone, text: WELCOME_MESSAGE, sessionId: sessionId ?? undefined });
    let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
    if (!outbound.sent) {
      alert = await sendTelegramAlert({ name: leadName, phone, reason: `OpenWA welcome failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: WELCOME_MESSAGE }], mediaUrl, closed: false });
    }
    return json({ ok: true, lead_id: leadId, reply: WELCOME_MESSAGE, welcome_menu: true, needs_human: !outbound.sent, ai_paused: !outbound.sent, telegram_alert: alert, outbound });
  }

  if (option === 1 || option === 2) {
    const reply = option === 1
      ? "Great — I can help you book a car. Please tell me which make/model you need, your preferred dates, and whether you need a PCO rental. Is that all for today?"
      : "I’m sorry to hear that. Please send the vehicle registration, incident date, location, and a short description of what happened. You can also attach photos. Is that all for today?";
    const intent = option === 1 ? "book_car" : "report_accident";
    await insertWithSessionFallback(db, "messages", {
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: reply,
      session_id: sessionId,
    });
    await db.from("whatsapp_leads").update({ intent, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const outbound = await sendOpenWaText({ phone, text: reply, sessionId: sessionId ?? undefined });
    let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
    if (!outbound.sent) {
      alert = await sendTelegramAlert({ name: leadName, phone, reason: `OpenWA reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    }
    return json({ ok: true, lead_id: leadId, reply, needs_human: !outbound.sent, ai_paused: !outbound.sent, telegram_alert: alert, outbound });
  }

  if (option === 3) {
    const reply =
      "No problem — I’m connecting you with a member of our team now. They’ll reply here shortly.";
    await insertWithSessionFallback(db, "messages", {
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: reply,
      handoff: true,
      session_id: sessionId,
    });
    await db
      .from("whatsapp_leads")
      .update({
        status: "needs_human",
        ai_paused: true,
        intent: "speak_to_human",
        ai_summary: reply,
      } as never)
      .eq("id", leadId);
    const outbound = await sendOpenWaText({ phone, text: reply, sessionId: sessionId ?? undefined });
    const alert = await sendTelegramAlert({
      name: leadName,
      phone,
      reason: outbound.sent ? "Customer requested a human" : `OpenWA reply failed: ${outbound.reason}`,
      leadId,
      history: [...history, { sender: "ai_agent", content: reply }],
      mediaUrl,
      closed: false,
    });
    return json({ ok: true, lead_id: leadId, reply, needs_human: true, telegram_alert: alert, outbound });
  }

  if (isPositiveClosure(content)) {
    const reply = "Thanks for contacting Virtual Car Hire. Your conversation is now closed.";
    await insertWithSessionFallback(db, "messages", {
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: reply,
      session_id: sessionId,
    });
    const finalHistory = [...history, { sender: "ai_agent", content: reply }];
    await db
      .from("whatsapp_leads")
      .update({
        status: "closed",
        ai_paused: true,
        closed_at: new Date().toISOString(),
        ai_summary: reply,
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", leadId);
    const outbound = await sendOpenWaText({ phone, text: reply, sessionId: sessionId ?? undefined });
    const alert = await sendTelegramAlert({
      name: leadName,
      phone,
      reason: outbound.sent ? "Customer confirmed closure" : `OpenWA reply failed: ${outbound.reason}`,
      leadId,
      history: finalHistory,
      mediaUrl,
      closed: true,
    });
    return json({
      ok: true,
      lead_id: leadId,
      reply,
      closed: true,
      needs_human: false,
      telegram_alert: alert,
      outbound,
    });
  }

  const { data: fleet } = await db
    .from("vehicles")
    .select("reg, make, model, year, fuel_type, status, next_mot_date, pco_expiry_date");
  const ai = await generateReply(
    history,
    content,
    Boolean(mediaUrl),
    (fleet ?? []) as FleetVehicle[],
  );
  const needsHuman = Boolean(ai.needs_human);
  const finalReply =
    needsHuman && !ai.reply ? "I’m connecting you with a member of our team now." : ai.reply;
  await insertWithSessionFallback(db, "messages", {
    user_id: userId,
    lead_id: leadId,
    sender: "ai_agent",
    content: finalReply,
    handoff: needsHuman,
    session_id: sessionId,
  });
  await db
    .from("whatsapp_leads")
    .update({
      ai_summary: finalReply,
      ...(needsHuman ? { status: "needs_human", ai_paused: true } : {}),
      last_message_at: new Date().toISOString(),
    } as never)
    .eq("id", leadId);

  const outbound = await sendOpenWaText({ phone, text: finalReply, sessionId: sessionId ?? undefined });
  const deliveryFailed = !outbound.sent;
  let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
  if (needsHuman || deliveryFailed) {
    alert = await sendTelegramAlert({
      name: leadName,
      phone,
      reason: deliveryFailed ? `OpenWA reply failed: ${outbound.reason}` : (ai.reason || "AI trouble or customer needs help"),
      leadId,
      history: [...history, { sender: "ai_agent", content: finalReply }],
      mediaUrl,
      closed: false,
    });
  }
  return json({
    ok: true,
    lead_id: leadId,
    reply: finalReply,
    needs_human: needsHuman || deliveryFailed,
    ai_paused: needsHuman || deliveryFailed,
    telegram_alert: alert,
    outbound,
  });
}
