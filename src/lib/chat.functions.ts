import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const replySchema = z.object({
  leadId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
});

const modeSchema = z.object({
  leadId: z.string().uuid(),
  paused: z.boolean(),
});

/** Send a reply as a human agent: logs it, halts AI for the lead, routes it outward. */
export const sendHumanReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => replySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead, error: leadErr } = await supabase
      .from("whatsapp_leads")
      .select("id, contact_name, phone")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead not found");

    const { error: msgErr } = await supabase.from("messages").insert({
      user_id: userId,
      lead_id: lead.id,
      sender: "human",
      content: data.content,
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
    const outbound = await routeOutbound({
      phone: lead.phone ?? null,
      name: lead.contact_name,
      content: data.content,
      leadId: lead.id,
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
