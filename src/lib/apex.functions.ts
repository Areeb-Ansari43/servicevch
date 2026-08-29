import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  question: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(12)
    .optional(),
});

/**
 * Apex — the CRM assistant. Answers questions using the caller's own fleet data,
 * read server-side under RLS so it can never see another tenant's records.
 */
export const askApex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);

    const [vehiclesRes, servicesRes, driversRes, leadsRes, accidentsRes] = await Promise.all([
      supabase
        .from("vehicles")
        .select(
          "reg, make, model, year, fuel_type, current_mileage, status, next_service_date, next_mot_date, pco_expiry_date",
        )
        .limit(200),
      supabase
        .from("service_records")
        .select("reg, service_date, service_type, cost, mileage, garage, notes")
        .order("service_date", { ascending: false })
        .limit(80),
      supabase
        .from("driver_tracks")
        .select(
          "reg, driver_name, start_date, start_mileage, current_mileage, allowance, rate_pence, active",
        )
        .limit(80),
      supabase
        .from("whatsapp_leads")
        .select("contact_name, phone, intent, status, ai_summary, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("accident_cases")
        .select("reg, driver_name, incident_date, severity, status, ai_summary")
        .order("incident_date", { ascending: false })
        .limit(40),
    ]);

    const crm = {
      today,
      vehicles: vehiclesRes.data ?? [],
      recent_services: servicesRes.data ?? [],
      driver_mileage: driversRes.data ?? [],
      whatsapp_leads: leadsRes.data ?? [],
      accident_cases: accidentsRes.data ?? [],
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return {
        answer: "Apex is not configured right now. Please try again shortly.",
        ok: false as const,
      };
    }

    const messages = [
      {
        role: "system",
        content:
          `You are Apex, the AI assistant inside the Virtual Car Hire fleet CRM. Today is ${today}. ` +
          `Answer strictly from the CRM JSON provided. Be concise and practical: short sentences, bullet lists, ` +
          `UK date format (DD/MM/YYYY), GBP with £. Registration plates in UPPERCASE with no spaces. ` +
          `"PCO licence" maps to pco_expiry_date and "MOT" to next_mot_date. If the data does not contain the answer, ` +
          `say so plainly rather than guessing.\n\nCRM DATA:\n${JSON.stringify(crm)}`,
      },
      ...(data.history ?? []),
      { role: "user", content: data.question },
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages }),
    });

    if (res.status === 429)
      return {
        answer: "Apex is rate limited right now — try again in a moment.",
        ok: false as const,
      };
    if (res.status === 402)
      return {
        answer: "Apex is out of AI credits. Top up workspace credits to continue.",
        ok: false as const,
      };
    if (!res.ok) {
      console.error("[Apex] gateway error", res.status, await res.text());
      return {
        answer: "Apex couldn't reach the AI service. Please try again.",
        ok: false as const,
      };
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return {
      answer: json.choices?.[0]?.message?.content ?? "No answer returned.",
      ok: true as const,
    };
  });
