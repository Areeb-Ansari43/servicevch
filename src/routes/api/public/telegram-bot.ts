import { createFileRoute } from "@tanstack/react-router";

/**
 * Telegram Admin Assistant.
 *
 * POST /api/public/telegram-bot  (registered as the bot's webhook URL)
 *
 * Only the owner (TELEGRAM_OWNER_ID, falling back to TELEGRAM_CHAT_ID) can use it.
 * Understands natural language CRM queries ("show active leads", "status of Jane")
 * and control actions ("set Jane status to handed over", "add note ... to Jane").
 */
export const Route = createFileRoute("/api/public/telegram-bot")({
  server: {
    handlers: {
      POST: async ({ request }) => handleUpdate(request),
    },
  },
});

const CRM_BASE = "https://servicevch.lovable.app";
const STATUSES = ["new", "contacted", "handed over", "human", "closed"] as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function sendMessage(chatId: number | string, text: string) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    console.warn("[telegram-bot] TELEGRAM_BOT_TOKEN not configured");
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) console.warn("[telegram-bot] sendMessage failed", res.status, await res.text());
  } catch (err) {
    console.warn("[telegram-bot] sendMessage error", err);
  }
}

type Intent =
  | { action: "list_leads"; status?: string | null; limit?: number | null }
  | { action: "lead_status"; name: string }
  | { action: "update_status"; name: string; status: string }
  | { action: "add_note"; name: string; note: string }
  | { action: "pause_ai"; name: string; paused: boolean }
  | { action: "help" };

const HELP =
  "🤖 <b>VCH Admin Assistant</b>\n\n" +
  "Try:\n" +
  "• <i>Show active leads</i>\n" +
  "• <i>What is the status of Jane?</i>\n" +
  "• <i>Update lead Jane status to handed over</i>\n" +
  "• <i>Add note called back today to Jane</i>\n" +
  "• <i>Pause AI for Jane</i> / <i>Resume AI for Jane</i>";

/** Turn free-form owner text into a structured CRM intent. */
async function parseIntent(text: string): Promise<Intent> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const t = text.trim();
  if (/^\/?(start|help)$/i.test(t)) return { action: "help" };
  if (!lovableKey) return { action: "help" };

  const system =
    "You convert a fleet manager's Telegram message into a CRM command for Virtual Car Hire. " +
    `Valid lead statuses: ${STATUSES.join(", ")}. ` +
    "Actions: list_leads (optionally filtered by status), lead_status (look up one lead by contact name), " +
    "update_status, add_note, pause_ai (paused true to take over, false to resume AI), help when unclear. " +
    "Return name exactly as written by the user. Use empty strings for unused fields.";

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: t },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "crm_intent",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["action", "name", "status", "note", "paused"],
              properties: {
                action: {
                  type: "string",
                  enum: ["list_leads", "lead_status", "update_status", "add_note", "pause_ai", "help"],
                },
                name: { type: "string" },
                status: { type: "string" },
                note: { type: "string" },
                paused: { type: "boolean" },
              },
            },
          },
        },
      }),
    });
    if (!res.ok) {
      console.error("[telegram-bot] AI gateway error", res.status, await res.text());
      return { action: "help" };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const p = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as {
      action?: string;
      name?: string;
      status?: string;
      note?: string;
      paused?: boolean;
    };
    switch (p.action) {
      case "list_leads":
        return { action: "list_leads", status: p.status || null };
      case "lead_status":
        return p.name ? { action: "lead_status", name: p.name } : { action: "help" };
      case "update_status":
        return p.name && p.status ? { action: "update_status", name: p.name, status: p.status } : { action: "help" };
      case "add_note":
        return p.name && p.note ? { action: "add_note", name: p.name, note: p.note } : { action: "help" };
      case "pause_ai":
        return p.name ? { action: "pause_ai", name: p.name, paused: Boolean(p.paused) } : { action: "help" };
      default:
        return { action: "help" };
    }
  } catch (err) {
    console.error("[telegram-bot] intent parse failure", err);
    return { action: "help" };
  }
}

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function findLead(db: Admin, userId: string, name: string) {
  const { data } = await db
    .from("whatsapp_leads")
    .select("id, contact_name, phone, status, ai_paused, ai_summary, message, last_message_at")
    .eq("user_id", userId)
    .ilike("contact_name", `%${name}%`)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function runIntent(intent: Intent, userId: string): Promise<string> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  if (intent.action === "help") return HELP;

  if (intent.action === "list_leads") {
    let q = db
      .from("whatsapp_leads")
      .select("id, contact_name, phone, status, ai_paused, last_message_at")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(10);
    if (intent.status) {
      q = intent.status.toLowerCase() === "active" ? q.neq("status", "closed") : q.eq("status", intent.status.toLowerCase());
    }
    const { data, error } = await q;
    if (error) return `⚠️ Query failed: ${esc(error.message)}`;
    if (!data?.length) return "No matching leads.";
    return (
      `📋 <b>Leads${intent.status ? ` · ${esc(intent.status)}` : ""}</b>\n\n` +
      data
        .map(
          (l) =>
            `• <b>${esc(l.contact_name)}</b> — ${esc(l.status)}${l.ai_paused ? " · human" : ""}\n` +
            `  ${esc(l.phone ?? "no number")} · ${new Date(l.last_message_at).toLocaleString("en-GB")}`,
        )
        .join("\n")
    );
  }

  const lead = await findLead(db, userId, intent.name);
  if (!lead) return `No lead found matching “${esc(intent.name)}”.`;
  const link = `${CRM_BASE}/whatsapp-leads?lead=${lead.id}`;

  if (intent.action === "lead_status") {
    return (
      `👤 <b>${esc(lead.contact_name)}</b>\n` +
      `<b>Status:</b> ${esc(lead.status)}${lead.ai_paused ? " (human handling)" : " (AI active)"}\n` +
      `<b>Phone:</b> ${esc(lead.phone ?? "n/a")}\n` +
      `<b>Last activity:</b> ${new Date(lead.last_message_at).toLocaleString("en-GB")}\n\n` +
      (lead.ai_summary ? `${esc(lead.ai_summary)}\n\n` : `${esc((lead.message ?? "").slice(0, 400))}\n\n`) +
      `<a href="${link}">Open in CRM →</a>`
    );
  }

  if (intent.action === "update_status") {
    const status = intent.status.toLowerCase();
    const { error } = await db.from("whatsapp_leads").update({ status } as never).eq("id", lead.id);
    if (error) return `⚠️ Update failed: ${esc(error.message)}`;
    return `✅ <b>${esc(lead.contact_name)}</b> status set to <b>${esc(status)}</b>.\n<a href="${link}">Open in CRM →</a>`;
  }

  if (intent.action === "add_note") {
    const { error } = await db.from("messages").insert({
      user_id: userId,
      lead_id: lead.id,
      sender: "human",
      content: `📝 Note (Telegram): ${intent.note}`,
    } as never);
    if (error) return `⚠️ Could not save note: ${esc(error.message)}`;
    return `✅ Note added to <b>${esc(lead.contact_name)}</b>.\n<a href="${link}">Open in CRM →</a>`;
  }

  const { error } = await db
    .from("whatsapp_leads")
    .update({ ai_paused: intent.paused, status: intent.paused ? "human" : "new" } as never)
    .eq("id", lead.id);
  if (error) return `⚠️ Update failed: ${esc(error.message)}`;
  return intent.paused
    ? `⏸ AI paused for <b>${esc(lead.contact_name)}</b> — you're handling it.`
    : `▶️ AI auto-replies resumed for <b>${esc(lead.contact_name)}</b>.`;
}

async function handleUpdate(request: Request) {
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"];
  if (secret && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: {
    message?: { text?: string; chat?: { id?: number }; from?: { id?: number } };
    edited_message?: { text?: string; chat?: { id?: number }; from?: { id?: number } };
  };
  try {
    update = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  const fromId = msg?.from?.id;
  const text = (msg?.text ?? "").trim();
  if (!chatId || !text) return json({ ok: true, ignored: true });

  // Security: only the configured owner may drive the CRM.
  const ownerId = process.env["TELEGRAM_OWNER_ID"] ?? process.env["TELEGRAM_CHAT_ID"];
  if (!ownerId) {
    console.warn("[telegram-bot] TELEGRAM_OWNER_ID / TELEGRAM_CHAT_ID not configured — rejecting.");
    return json({ ok: true, ignored: "owner_not_configured" });
  }
  if (String(fromId ?? "") !== String(ownerId).trim()) {
    console.warn("[telegram-bot] rejected non-owner sender", fromId);
    return json({ ok: true, ignored: "not_owner" });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: owner } = await supabaseAdmin.from("vehicles").select("user_id").limit(1).maybeSingle();
  if (!owner?.user_id) {
    await sendMessage(chatId, "⚠️ No fleet owner account found in the CRM.");
    return json({ ok: true });
  }

  try {
    const intent = await parseIntent(text);
    const reply = await runIntent(intent, owner.user_id);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("[telegram-bot] handler failure", err);
    await sendMessage(chatId, "⚠️ Something went wrong running that command.");
  }
  return json({ ok: true });
}
