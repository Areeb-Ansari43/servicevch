import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchOpenWaHistory } from "@/lib/openwa.server";
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
  handoff: boolean;
  created_at: string;
};

function isMissingColumn(error: unknown, column: string): boolean {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  return new RegExp(`${column}["']?\\s+column|column\\s+["']?${column}|schema cache`, "i").test(text ?? "");
}

async function insertMessageWithCompatibility(supabase: any, row: Record<string, unknown>) {
  let compatibleRow = { ...row };
  let result = await supabase.from("messages").insert(compatibleRow);
  for (const column of ["session_id", "handoff"]) {
    if (!result.error || !(column in compatibleRow) || !isMissingColumn(result.error, column)) continue;
    const { [column]: _removed, ...nextRow } = compatibleRow;
    compatibleRow = nextRow;
    result = await supabase.from("messages").insert(compatibleRow);
  }
  return result;
}

/** Load the complete local CRM history and merge older messages still held by OpenWA. */
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
        .select("id, sender, content, media_url, handoff, created_at")
        .eq("lead_id", data.leadId)
        .order("created_at", { ascending: true })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw new Error(error.message);
      localMessages.push(...((batch ?? []) as unknown as ConversationMessage[]));
      if ((batch ?? []).length < pageSize) break;
    }

    const linkedChatId = lead.session_id?.startsWith("wa:") ? lead.session_id.slice(3) : lead.phone;
    const remote = await fetchOpenWaHistory({ chatId: linkedChatId });
    const remoteMessages: ConversationMessage[] = remote.ok
      ? remote.messages
          .map((message, index) => {
            const text = message.body ?? message.text ?? "";
            if (!text && !message.media?.url) return null;
            const timestamp = Number(message.timestamp);
            const createdAt = Number.isFinite(timestamp)
              ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString()
              : new Date().toISOString();
            return {
              id: `openwa:${message.id ?? `${createdAt}:${index}`}`,
              sender: message.fromMe || message.from_me ? "human" : "customer",
              content: text || "(media)",
              media_url: message.media?.url ?? null,
              handoff: false,
              created_at: createdAt,
            };
          })
          .filter((message): message is ConversationMessage => message !== null)
      : [];

    const merged: ConversationMessage[] = [...localMessages, ...remoteMessages].filter((message, index, all) => {
      const duplicate = all.findIndex((candidate) =>
        candidate !== message && candidate.sender === message.sender && candidate.content === message.content &&
        Math.abs(new Date(String(candidate.created_at)).getTime() - new Date(String(message.created_at)).getTime()) < 120_000,
      );
      return duplicate === -1 || index < duplicate;
    });
    merged.sort((a, b) => new Date(String(a.created_at)).getTime() - new Date(String(b.created_at)).getTime());
    return { messages: merged };
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

    const { error: msgErr } = await insertMessageWithCompatibility(supabase, {
      user_id: userId,
      lead_id: lead.id,
      sender: "human",
      content: data.content,
      session_id: lead.session_id ?? null,
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

    const { routeOutbound } = await import("@/lib/chat.server");
    const linkedChatId = lead.session_id?.startsWith("wa:") ? lead.session_id.slice(3) : null;
    const outbound = await routeOutbound({
      phone: linkedChatId ?? lead.phone ?? null,
      name: lead.contact_name,
      content: data.content,
      leadId: lead.id,
      sessionId: linkedChatId ? null : (lead.session_id ?? null),
    });

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
