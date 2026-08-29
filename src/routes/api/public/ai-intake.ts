import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/integrations/supabase/config";

/**
 * Public AI intake endpoint.
 *
 * POST /api/public/ai-intake
 * { kind: "emergency" | "accident" | "whatsapp", text, from?, name?, issue?, vehicle? }
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

const HANDOFF_24H =
  "Our team will get back to you within 24 hours. Please do not contact this number — we will contact you first.";
const AUTO_SURGEON =
  "The Auto Surgeon, Unit 3 Squirrels Trading Estate, Viveash Close, Hayes UB3 4RZ";
const AUTO_SURGEON_MAP =
  "https://www.google.com/maps/search/?api=1&query=The+Auto+Surgeon+Unit+3+Squirrels+Trading+Estate+Viveash+Close+Hayes+UB3+4RZ";

type IntakeKind = "emergency" | "accident" | "whatsapp";
type AiIntake = { reply: string; summary: string; needs_human: boolean; reason: string };

function parseJson(text: string): AiIntake | null {
  try {
    const value = JSON.parse(
      text
        .replace(/^```json\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim(),
    );
    if (typeof value?.reply !== "string" || !value.reply.trim()) return null;
    return {
      reply: value.reply.trim(),
      summary:
        typeof value.summary === "string" ? value.summary.trim() : value.reply.trim().slice(0, 300),
      needs_human: Boolean(value.needs_human),
      reason: typeof value.reason === "string" ? value.reason : "",
    };
  } catch {
    return null;
  }
}

async function classify(
  kind: IntakeKind,
  text: string,
  name: string,
  issue: string,
  vehicle: string,
): Promise<AiIntake> {
  const fallbackReply =
    kind === "emergency"
      ? `I can help with this. If the vehicle is unsafe, stop in a safe place and call 999 if anyone is in immediate danger. For a breakdown, arrange your own recovery provider and take the vehicle to ${AUTO_SURGEON}. Do not leave the vehicle in a dangerous position. Please reply with your vehicle registration, exact location, and whether anyone is injured.`
      : "I’ve received your message. Please provide your vehicle registration, current location, and the key details of what happened so I can guide you correctly.";
  const fallback: AiIntake = {
    reply: fallbackReply,
    summary: `${issue || kind}: ${text}`.slice(0, 300),
    needs_human: false,
    reason: "",
  };
  const apiKey = (
    getRuntimeEnv("GEMINI_API_KEY") ??
    getRuntimeEnv("GOOGLE_API_KEY") ??
    getRuntimeEnv("GOOGLE_GEMINI_API_KEY") ??
    ""
  ).trim();
  if (!apiKey) return { ...fallback, needs_human: true, reason: "gemini_api_key_missing" };

  const system =
    kind === "emergency"
      ? `You are the first-response emergency support assistant for Virtual Car Hire, a UK PCO/private-hire rental company. Read the customer message and give practical, calm next steps immediately; do not simply say a team will contact them. If there is immediate danger or injury, tell them to call 999. For a breakdown, instruct them to use their own recovery provider because Virtual Car Hire does not provide recovery, and direct them to The Auto Surgeon, ${AUTO_SURGEON}; map: ${AUTO_SURGEON_MAP}. The key must be left in the letter box and the customer must later send a clear key photo and video for checking. Ask only for the next information needed. Keep the answer in clear UK English, short paragraphs, and under 700 characters. Never invent prices, availability, or a diagnosis. Set needs_human true only for immediate danger requiring emergency services, a technical failure, or a request that cannot safely be answered.`
      : "You are the Virtual Car Hire customer-support assistant. Read the customer message and help immediately in clear UK English. Use the supplied company operating context, ask for missing facts, and do not default to a human handoff. Keep replies concise and practical. Set needs_human true only for immediate danger, a technical failure, or a request requiring a human decision.";
  const context = `Customer name: ${name || "unknown"}\nIssue: ${issue || kind}\nVehicle: ${vehicle || "not specified"}\nMessage: ${text}`;
  const body = {
    systemInstruction: { parts: [{ text: `${system}\n\nOperating context:\n${context}` }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          reply: { type: "STRING" },
          summary: { type: "STRING" },
          needs_human: { type: "BOOLEAN" },
          reason: { type: "STRING" },
        },
        required: ["reply", "summary", "needs_human", "reason"],
      },
      temperature: 0.15,
    },
  };
  const model = (getRuntimeEnv("GEMINI_MODEL") ?? "gemini-2.0-flash-001").trim();
  for (const selectedModel of [model]) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify(body),
        },
      );
      const raw = await response.text();
      if (!response.ok) {
        console.error("[ai-intake] Gemini error", {
          model: selectedModel,
          status: response.status,
          body: raw.slice(0, 1000),
        });
        continue;
      }
      const data = JSON.parse(raw) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const result = parseJson(
        data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "",
      );
      if (result) return result;
    } catch (error) {
      console.error("[ai-intake] Gemini request failed", {
        model: selectedModel,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return fallback;
}

async function handleIntake(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  const kind: IntakeKind =
    body.kind === "emergency" ? "emergency" : body.kind === "accident" ? "accident" : "whatsapp";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 5000)
    return json({ ok: false, error: "`text` is required (max 5000 chars)" }, 400);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const issue = typeof body.issue === "string" ? body.issue.trim() : "";
  const vehicle = typeof body.vehicle === "string" ? body.vehicle.trim() : "";
  const phone = typeof body.from === "string" ? body.from.trim() : null;
  const ai = await classify(kind, text, name, issue, vehicle);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: owner } = await supabaseAdmin
    .from("vehicles")
    .select("user_id")
    .limit(1)
    .maybeSingle();
  const userId = owner?.user_id;
  if (!userId)
    return json({ ok: false, error: "No fleet owner account found", reply: ai.reply }, 500);

  let leadId: string | null = null;
  if (phone) {
    const { data: existing } = await (supabaseAdmin.from("whatsapp_leads") as any)
      .select("id")
      .eq("user_id", userId)
      .eq("phone", phone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
  }
  if (!leadId) {
    const { data: created, error } = await (supabaseAdmin.from("whatsapp_leads") as any)
      .insert({
        user_id: userId,
        contact_name: name || "Website visitor",
        phone,
        message: text,
        ai_summary: ai.summary,
        intent:
          kind === "emergency"
            ? "emergency_breakdown"
            : kind === "accident"
              ? "report_accident"
              : "support",
        status: ai.needs_human ? "needs_human" : "active",
      })
      .select("id")
      .single();
    if (error) return json({ ok: false, error: error.message, reply: ai.reply }, 500);
    leadId = created.id;
  } else {
    await (supabaseAdmin.from("whatsapp_leads") as any)
      .update({
        contact_name: name || undefined,
        message: text,
        ai_summary: ai.summary,
        status: ai.needs_human ? "needs_human" : "active",
        last_message_at: new Date().toISOString(),
      })
      .eq("id", leadId);
  }
  if (leadId) {
    await (supabaseAdmin.from("messages") as any).insert([
      { user_id: userId, lead_id: leadId, sender: "customer", content: text },
      {
        user_id: userId,
        lead_id: leadId,
        sender: "ai_agent",
        content: ai.reply,
        handoff: ai.needs_human,
      },
    ]);
  }
  return json({
    ok: true,
    kind,
    lead_id: leadId,
    reply: ai.reply,
    summary: ai.summary,
    needs_human: ai.needs_human,
    reason: ai.reason,
    whatsapp_number: "442072946756",
  });
}
