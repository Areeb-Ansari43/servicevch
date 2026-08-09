import { createFileRoute } from "@tanstack/react-router";

/**
 * AI intake endpoint.
 *
 * POST /api/public/ai-intake
 * { "kind": "whatsapp" | "accident", "text": "...", "from": "+44...", "name": "..." }
 *
 * The AI reads the raw message, structures it, and files it into
 * WhatsApp Leads or Accident Cases so it shows up in the dashboard.
 */
export const Route = createFileRoute("/api/public/ai-intake")({
  server: {
    handlers: {
      POST: async ({ request }) => handleIntake(request),
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

async function classify(kind: "whatsapp" | "accident", text: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const schema =
    kind === "whatsapp"
      ? {
          type: "object",
          additionalProperties: false,
          required: ["summary", "intent", "contact_name"],
          properties: {
            summary: { type: "string" },
            intent: { type: "string", enum: ["rental enquiry", "pricing", "availability", "support", "complaint", "other"] },
            contact_name: { type: "string" },
          },
        }
      : {
          type: "object",
          additionalProperties: false,
          required: ["summary", "severity", "reg", "driver_name", "location"],
          properties: {
            summary: { type: "string" },
            severity: { type: "string", enum: ["minor", "moderate", "severe"] },
            reg: { type: "string" },
            driver_name: { type: "string" },
            location: { type: "string" },
          },
        };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            kind === "whatsapp"
              ? "You triage inbound WhatsApp messages for a UK car hire company. Summarise in one sentence and classify the intent. Use an empty string when a field is unknown."
              : "You triage accident reports for a UK car hire fleet. Summarise in one sentence, rate severity, and extract the UK registration plate, driver name and location. Use an empty string when a field is unknown.",
        },
        { role: "user", content: text },
      ],
      response_format: { type: "json_schema", json_schema: { name: "intake", strict: true, schema } },
    }),
  });

  if (!res.ok) return null;
  const data: any = await res.json();
  try {
    return JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
  } catch {
    return null;
  }
}

async function handleIntake(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const kind = body?.kind === "accident" ? "accident" : "whatsapp";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 5000) return json({ ok: false, error: "`text` is required (max 5000 chars)" }, 400);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // File against the fleet owner account.
  const { data: owner } = await supabaseAdmin.from("vehicles").select("user_id").limit(1).maybeSingle();
  const userId = owner?.user_id;
  if (!userId) return json({ ok: false, error: "No fleet owner account found" }, 500);

  const ai = await classify(kind, text);

  if (kind === "whatsapp") {
    const { error } = await supabaseAdmin.from("whatsapp_leads").insert({
      user_id: userId,
      contact_name: (typeof body?.name === "string" && body.name) || ai?.contact_name || "Unknown",
      phone: typeof body?.from === "string" ? body.from : null,
      message: text,
      ai_summary: ai?.summary ?? null,
      intent: ai?.intent ?? null,
      status: "new",
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, kind, ai });
  }

  const reg = (typeof body?.reg === "string" && body.reg) || ai?.reg || "";
  let vehicleId: string | null = null;
  if (reg) {
    const { data: v } = await supabaseAdmin
      .from("vehicles")
      .select("id")
      .eq("reg", reg.toUpperCase().replace(/\s+/g, ""))
      .maybeSingle();
    vehicleId = v?.id ?? null;
  }

  const { error } = await supabaseAdmin.from("accident_cases").insert({
    user_id: userId,
    vehicle_id: vehicleId,
    reg: reg.toUpperCase(),
    driver_name: (typeof body?.driver_name === "string" && body.driver_name) || ai?.driver_name || null,
    incident_date: typeof body?.incident_date === "string" ? body.incident_date : new Date().toISOString().slice(0, 10),
    location: (typeof body?.location === "string" && body.location) || ai?.location || null,
    description: text,
    ai_summary: ai?.summary ?? null,
    severity: ai?.severity ?? "minor",
    status: "open",
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, kind, ai });
}
