import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { z } from "zod";

const replySchema = z.object({
  leadId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

const modeSchema = z.object({
  leadId: z.string().uuid(),
  paused: z.boolean(),
});

const historySchema = z.object({ leadId: z.string().uuid() });

type ConversationMessage = {
  id: string;
  sender: string;
  content: string;
  media_url: string | null;
  media_type?: string | null;
  media_mime_type?: string | null;
  handoff: boolean;
  created_at: string;
  status?: string | null;
  meta_message_id?: string | null;
};

function isMissingColumn(error: unknown, column: string): boolean {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  return new RegExp(`${column}["']?\\s+column|column\\s+["']?${column}|schema cache`, "i").test(
    text ?? "",
  );
}

async function insertMessageWithCompatibility(supabase: any, row: Record<string, unknown>) {
  let compatibleRow = { ...row };
  let result = await supabase.from("messages").insert(compatibleRow);
  for (const column of ["session_id", "handoff", "meta_message_id", "status"]) {
    if (!result.error || !(column in compatibleRow) || !isMissingColumn(result.error, column))
      continue;
    const { [column]: _removed, ...nextRow } = compatibleRow;
    compatibleRow = nextRow;
    result = await supabase.from("messages").insert(compatibleRow);
  }
  return result;
}

/** Load the complete locally persisted Meta WhatsApp CRM history. */
export const getLeadConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => historySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: lead, error: leadError } = await context.supabase
      .from("whatsapp_leads")
      .select("phone, session_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (!lead) throw new Error("Lead not found");

    const pageSize = 500;
    const localMessages: ConversationMessage[] = [];
    for (let page = 0; ; page += 1) {
      const { data: batch, error } = await context.supabase
        .from("messages")
        .select("id, sender, content, media_url, media_type, media_mime_type, handoff, created_at, status, meta_message_id")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) {
        // Fallback without status or meta_message_id if columns missing
        const { data: fallbackBatch, error: fallbackError } = await context.supabase
          .from("messages")
          .select("id, sender, content, media_url, media_type, media_mime_type, handoff, created_at")
          .eq("lead_id", data.leadId)
          .order("created_at", { ascending: true })
          .range(page * pageSize, page * pageSize + pageSize - 1);
        if (fallbackError) throw new Error(fallbackError.message);
        localMessages.push(...((fallbackBatch ?? []) as unknown as ConversationMessage[]));
        if ((fallbackBatch ?? []).length < pageSize) break;
      } else {
        localMessages.push(...((batch ?? []) as unknown as ConversationMessage[]));
        if ((batch ?? []).length < pageSize) break;
      }
    }

    localMessages.sort(
      (a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime(),
    );
    return { messages: localMessages };
  });

/** Send a reply as a human agent: logs it, halts AI for the lead, routes it outward. */
export const sendHumanReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => replySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead, error: leadErr } = await supabase
      .from("whatsapp_leads")
      .select("id, contact_name, phone, session_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead not found");

    const { routeOutbound } = await import("@/lib/chat.server");
    const outbound = await routeOutbound({
      phone: lead.phone ?? null,
      name: lead.contact_name,
      content: data.content,
      leadId: lead.id,
    });

    const { error: msgErr } = await insertMessageWithCompatibility(supabase, {
      user_id: userId,
      lead_id: lead.id,
      sender: "human",
      content: data.content,
      session_id: lead.session_id ?? null,
      meta_message_id: outbound.messageId ?? null,
      status: outbound.routed ? "sent" : "failed",
    });
    if (msgErr) throw new Error(msgErr.message);

    const { error: updErr } = await supabase
      .from("whatsapp_leads")
      .update({
        ai_paused: true,
        status: "human",
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", lead.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, outbound };
  });

/** Toggle a lead between human-handled and AI auto-reply mode. */
export const setLeadAiMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => modeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_leads")
      .update({ ai_paused: data.paused, status: data.paused ? "human" : "new" } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true, paused: data.paused };
  });

const rewordSchema = z.object({
  driverName: z.string(),
  registration: z.string(),
  rawMessage: z.string().trim().min(1),
});

/** Reword a plain staff message into a polite, polished driver message using Gemini AI. */
export const rewordCustomMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => rewordSchema.parse(d))
  .handler(async ({ data }) => {
    const geminiKey =
      getRuntimeEnv("GEMINI_API_KEY") ||
      getRuntimeEnv("VITE_GEMINI_API_KEY") ||
      getRuntimeEnv("GEMINI_API_TOKEN");

    const prompt = `You are a polite, professional driver relations assistant for Virtual Car Hire (a premium vehicle rental company in the UK).
Rewrite the following raw message from staff into a warm, polite, professional, and clear message for the driver (${data.driverName}, vehicle reg: ${data.registration}).
Keep all key facts, dates, monetary amounts, and instructions intact. Do NOT use em dashes.
Raw Message: ${data.rawMessage}
Return ONLY the reworded message text.`;

    if (geminiKey) {
      try {
        const model = (getRuntimeEnv("GEMINI_MODEL") ?? "gemini-2.5-flash").trim();
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
          }),
        });

        if (res.ok) {
          const json = await res.json();
          const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && typeof text === "string" && text.trim().length > 0) {
            return { reworded: text.trim().replace(/—/g, ", ") };
          }
        }
      } catch (err) {
        console.warn("[rewordCustomMessage] Gemini call failed, using fallback:", err);
      }
    }

    const fallback = `Hello ${data.driverName}, ${data.rawMessage}. Please check your portal or contact us if you have any questions. Thank you, Virtual Car Hire.`;
    return { reworded: fallback };
  });
