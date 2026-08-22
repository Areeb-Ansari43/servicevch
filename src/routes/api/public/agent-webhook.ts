import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendOpenWaImage, sendOpenWaText } from "@/lib/openwa.server";

const CRM_BASE = "https://servicevch.pages.dev";
const VCH_WEBSITE = "https://virtualcarhire.pages.dev/our-fleet";
const WELCOME_IMAGE_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663646717561/LWsrZDwfCPweeEQG.webp";
const WELCOME_MENU =
  "👋 Hello, and welcome to Virtual Car Hire\n" +
  "🚘 London's number one PCO car hire company with 4.8 stars across Google and Trustpilot.\n\n" +
  "How can we assist you today? Please reply with the number corresponding to your choice:\n" +
  "🚗 1. Enquire about a car\n" +
  "⚠️ 2. Report accident\n\n" +
  "Please reply with 1 or 2 to get started.";
const WEBSITE_CATALOG = [
  { make: "Mercedes", model: "E300", fuel: "Plug-in-Hybrid", price: "£340/week", year: "2021–24" },
  { make: "Mercedes", model: "Vito", fuel: "Petrol", price: "£380/week", year: "2021–24" },
  { make: "Mercedes", model: "V-Class", fuel: "Petrol", price: "£450/week", year: "2022–24" },
  { make: "Mercedes", model: "EQS", fuel: "Electric", price: "£500/week", year: "2022–24" },
  { make: "Mercedes", model: "E220", fuel: "Petrol", price: "£310/week", year: "2020–24" },
  { make: "Mercedes", model: "EQE", fuel: "Electric", price: "£440/week", year: "2023–24" },
  { make: "Toyota", model: "Corolla Estate", fuel: "Plug-in-Hybrid", price: "£220/week", year: "2021–24" },
  { make: "Toyota", model: "Auris Estate", fuel: "Plug-in-Hybrid", price: "£210/week", year: "2019–22" },
  { make: "Toyota", model: "Prius", fuel: "Plug-in-Hybrid", price: "£200/week", year: "2020–24" },
  { make: "Tesla", model: "Model 3", fuel: "Electric", price: "£260/week", year: "2021–24" },
  { make: "Jaguar", model: "I-Pace", fuel: "Electric", price: "£330/week", year: "2020–24" },
  { make: "Hyundai", model: "IONIQ", fuel: "Plug-in-Hybrid", price: "£220/week", year: "2020–23" },
  { make: "MG", model: "MG5 EV", fuel: "Electric", price: "£200/week", year: "2022–24" },
  { make: "Ford", model: "Tourneo Custom", fuel: "Plug-in-Hybrid", price: "£410/week", year: "2021–24" },
  { make: "MG", model: "MG S9 PHEV SUV", fuel: "Plug-in-Hybrid", price: "£350/week", year: "2024–25" },
  { make: "Volkswagen", model: "Multivan PHEV", fuel: "Plug-in-Hybrid", price: "£350/week", year: "2024–25" },
];
const STANDARD_TERMS =
  "Minimum 4-week flexible term; standard allowance 1,000 miles per month; insurance, servicing and roadside breakdown cover included.";

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
  chat_id: z.string().trim().min(3).max(160).optional(),
  openwa_session_id: z.string().trim().min(1).max(160).optional(),
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

function isMissingColumn(error: unknown, column: string): boolean {
  const text = error instanceof Error ? error.message : JSON.stringify(error);
  return new RegExp(`${column}["']?\\s+column|column\\s+["']?${column}|schema cache`, "i").test(text ?? "");
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
  let currentRow = { ...row };
  let result = await runInsert(currentRow);
  for (const column of ["session_id", "handoff"]) {
    if (!result.error || !(column in currentRow) || !isMissingColumn(result.error, column)) continue;
    const { [column]: _removed, ...compatibleRow } = currentRow;
    currentRow = compatibleRow;
    console.warn(`[agent-webhook] ${table} has no ${column}; retrying with compatible schema`);
    result = await runInsert(currentRow);
  }
  return result;
}

function isAbusiveMessage(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[^a-z0-9]+/g, " ");
  const abusiveTerms = [
    "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "bitch",
    "bastard", "dickhead", "asshole", "arsehole", "wanker", "twat", "cunt",
    "prick", "slut", "whore", "piss off", "go to hell",
  ];
  return abusiveTerms.some((term) => new RegExp(`(?:^|\\s)${term.replace(/ /g, "\\s+")}(?:$|\\s)`, "i").test(normalized));
}

function isMenuReset(text: string): boolean {
  return /^(?:menu|main menu|restart|start again|start over|reset|hello|hi)[.!\s]*$/i.test(text.trim());
}

function isCarRequest(text: string): boolean {
  return /\b(?:car|cars|vehicle|vehicles|available|availability|fleet|hire|rent|rental|mercedes|toyota|tesla|eqe|corolla|auris|prius|e300|e220|vito|eqs|ioniq|jaguar|mg5|tourneo|multivan)\b/i.test(text);
}

function isAccidentRequest(text: string): boolean {
  return /\b(?:accident|crash|collision|bumped|damage|damaged|smash|hit|incident)\b/i.test(text);
}

function isLikelyFullName(text: string): boolean {
  const value = text.trim();
  return value.length >= 3 && value.length <= 90 && !isCarRequest(value) && /^[A-Za-z][A-Za-z .'-]+$/.test(value);
}

function parseMenuOption(text: string): 1 | 2 | 3 | null {
  const normalized = text.trim().toLowerCase();
  if (/^(?:option\s*)?\[?1\]?[.)]?$/.test(normalized) || normalized === "book a car") return 1;
  if (/^(?:option\s*)?\[?2\]?[.)]?$/.test(normalized) || normalized === "report accident") return 2;
  if (/^(?:option\s*)?\[?3\]?[.)]?$/.test(normalized) || normalized === "speak to human") return 3;
  return null;
}

function isTermsResponse(text: string): boolean {
  return /^(?:yes|no|yeah|nope|yep|not yet|i(?:'m| am) not sure)[.!\s]*$/i.test(text.trim());
}

function isPositiveClosure(text: string): boolean {
  return /^(?:yes|yeah|yep|yup|that'?s all|all good|no thanks|no thank you|that is all|that’s all)[.!\s]*$/i.test(
    text.trim(),
  );
}

function includesClosureQuestion(text: string): boolean {
  return /is that all for today\??/i.test(text);
}

function parseAiReply(content: string): Pick<AiResult, "reply" | "needs_human" | "reason" | "asks_closure"> {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
    if (reply) {
      return {
        reply,
        needs_human: Boolean(parsed.needs_human),
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
        asks_closure: Boolean(parsed.asks_closure) || includesClosureQuestion(reply),
      };
    }
  } catch {
    // Some compatible gateways return normal text even when JSON was requested.
  }
  return { reply: cleaned, needs_human: false, reason: "", asks_closure: includesClosureQuestion(cleaned) };
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

function websiteMatch(vehicle: FleetVehicle): (typeof WEBSITE_CATALOG)[number] | undefined {
  const make = vehicle.make.toLowerCase();
  const model = vehicle.model.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
  return WEBSITE_CATALOG.find((item) => {
    const itemModel = item.model.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
    return item.make.toLowerCase() === make && (itemModel.includes(model.replace(/ estate$/i, "")) || model.includes(itemModel.replace(/ ev$/i, "")));
  });
}

function formatCustomerFleet(fleet: FleetVehicle[]): string {
  const available = fleet.filter(isAvailable);
  if (!available.length) return "I’m sorry, there are no vehicles currently marked available. A team member can confirm the next incoming cars.";
  const lines = available.map((vehicle, index) => {
    const catalog = websiteMatch(vehicle);
    const price = catalog?.price ?? "Price to confirm";
    const year = vehicle.year ?? catalog?.year ?? "Year to confirm";
    return `${index + 1}. ${vehicle.make} ${vehicle.model} (${year}) — ${catalog?.fuel ?? fuelCategory(vehicle.fuel_type)} — ${price}`;
  });
  return `Thank you for your interest in our PCO fleet. Here are all vehicles currently marked available:\n\n${lines.join("\n")}\n\nPlease tell me which vehicle you would like to go with, and I will provide its complete contract details.\n\nPrices shown from ${VCH_WEBSITE}; vehicles without a published website rate are marked Price to confirm.`;
}

function findSelectedVehicle(text: string, fleet: FleetVehicle[]): FleetVehicle | undefined {
  const value = text.toLowerCase();
  const available = fleet.filter(isAvailable);
  return available.find((vehicle) => {
    const make = vehicle.make.toLowerCase();
    const model = vehicle.model.toLowerCase();
    const reg = vehicle.reg.toLowerCase();
    return value.includes(reg) || (value.includes(make) && value.includes(model)) ||
      value.includes(model) || (value.includes(make) && /\b(?:300|350|220)\b/.test(value) && model.includes(value.match(/\b(?:300|350|220)\b/)?.[0] ?? ""));
  });
}

function formatVehicleDetails(vehicle: FleetVehicle): string {
  const catalog = websiteMatch(vehicle);
  const price = catalog?.price ?? "Price to confirm";
  const year = vehicle.year ?? catalog?.year ?? "Year to confirm";
  return `Thank you for choosing the ${vehicle.make} ${vehicle.model}.\n\nVehicle: ${vehicle.make} ${vehicle.model}\nYear: ${year}\nFuel category: ${catalog?.fuel ?? fuelCategory(vehicle.fuel_type)}\nContract length: Minimum 4-week flexible term\nMileage allowance: 1,000 miles per month (standard plan)\nWeekly rate: ${price}\nIncluded: Servicing, maintenance and roadside breakdown cover\n\nAre you fully aware of and happy with these contract length and mileage details? Please reply Yes or No.`;
}

function formatFleet(fleet: FleetVehicle[]): string {
  const available = fleet.filter(isAvailable);
  const grouped = ["Electric", "Plug-in-Hybrid", "Petrol"].map((category) => {
    const cars = available
      .filter((vehicle) => fuelCategory(vehicle.fuel_type) === category)
      .map((vehicle) => {
        const catalog = websiteMatch(vehicle);
        const year = vehicle.year ?? catalog?.year ?? "year to confirm";
        const price = catalog?.price ?? "price to confirm";
        return `${vehicle.make} ${vehicle.model} (${year}; ${price})`;
      })
      .join(", ");
    return `${category}: ${cars || "none currently available"}`;
  });
  return `Available vehicles (${available.length}/${fleet.length}; rented, in-service and off-road vehicles excluded):\n${grouped.join("\n")}`;
}

async function sendWelcomeMenu(phone: unknown, sessionId?: string) {
  const image = await sendOpenWaImage({ phone, url: WELCOME_IMAGE_URL, caption: WELCOME_MENU, sessionId });
  if (image.sent) return image;
  console.warn("[agent-webhook] welcome image unavailable; falling back to text menu", { reason: image.reason });
  return sendOpenWaText({ phone, text: WELCOME_MENU, sessionId });
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
    "Reply naturally in UK English. Use concise paragraphs and bullet-style lines when listing cars or contract details. Use £ for prices. " +
    "Use only the supplied live fleet data: never invent availability, prices, dates, MOT or PCO information. " +
    "Treat only vehicles marked available/active/in stock as available; rented, assigned, in-service and off-road vehicles are unavailable. " +
    "If the customer asks for a car, wants to hire/rent, asks what is available, or uses any natural wording with the same meaning, treat it as a car enquiry and show all currently available vehicles from the supplied fleet, grouped clearly under Electric, Plug-in-Hybrid, Petrol where possible. If the conversation already contains the complete available-fleet list and the customer names a vehicle, respond with that vehicle's complete contract details: contract length, mileage allowance, weekly rate, and inclusions, then ask for Yes or No confirmation. If the requested car is unavailable, explicitly say so and suggest alternatives under exactly these headings: Electric, Plug-in-Hybrid, Petrol. Do not repeat the full fleet list when the customer has selected a vehicle. " +
    "If you cannot safely answer, the AI service fails, or you become stuck, set needs_human true; otherwise keep needs_human false. For an accident report, gather the details for the CRM accident workflow instead of handing off immediately. " +
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
    const geminiKeyBindings = [
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "GOOGLE_GEMINI_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "VITE_GEMINI_API_KEY",
    ];
    const geminiKeyBinding = geminiKeyBindings.find((binding) => Boolean(getRuntimeEnv(binding)));
    const geminiKey = geminiKeyBinding ? getRuntimeEnv(geminiKeyBinding) : undefined;
    console.info("[agent-webhook] AI generation start", {
      historyLength: history.length,
      hasMedia,
      hasGeminiKey: Boolean(geminiKey),
      geminiKeyBinding: geminiKeyBinding ?? null,
    });
    if (!geminiKey) {
      console.error("[agent-webhook] AI generation skipped: no supported Gemini API key binding is configured", { supportedBindings: geminiKeyBindings });
      return { ...fallback, reason: "gemini_api_key_missing" };
    }
    const responseSchema = {
      type: "OBJECT",
      properties: {
        reply: { type: "STRING" },
        needs_human: { type: "BOOLEAN" },
        reason: { type: "STRING" },
        asks_closure: { type: "BOOLEAN" },
      },
      required: ["reply", "needs_human", "reason", "asks_closure"],
    };
    const requestBody = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.2 },
    };
    const requestHeaders = { "Content-Type": "application/json", "x-goog-api-key": geminiKey.trim() };
    const preferredModels = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-1.5-flash",
    ];
    const apiVersions = ["v1beta", "v1"];
    type GeminiGeneration = { response: Response; body: string; model: string; apiVersion: string };
    const callModel = async (apiVersion: string, model: string): Promise<GeminiGeneration> => {
      const response = await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });
      return { response, body: await response.text(), model, apiVersion };
    };
    const discoverModels = async (apiVersion: string): Promise<string[]> => {
      const response = await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models`, { headers: requestHeaders });
      if (!response.ok) return [];
      const modelList = await response.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      return (modelList.models ?? [])
        .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
        .map((model) => model.name?.replace(/^models\//, ""))
        .filter((model): model is string => Boolean(model));
    };
    let generation: GeminiGeneration | undefined;
    for (const apiVersion of apiVersions) {
      const discovered = await discoverModels(apiVersion);
      const models = [...preferredModels.filter((model) => discovered.includes(model)), ...discovered.filter((model) => /flash/i.test(model) && !preferredModels.includes(model)), ...preferredModels.filter((model) => discovered.length === 0)];
      for (const model of [...new Set(models)]) {
        const attempt = await callModel(apiVersion, model);
        generation = attempt;
        if (attempt.response.ok) break;
        if (attempt.response.status !== 404) break;
      }
      if (generation?.response.ok || generation?.response.status !== 404) break;
    }
    if (!generation) generation = await callModel("v1beta", "gemini-2.5-flash");
    if (!generation.response.ok) {
      console.error("[agent-webhook] Gemini API error", {
        status: generation.response.status,
        statusText: generation.response.statusText,
        responseBody: generation.body.slice(0, 2000),
        model: generation.model,
      });
      return { ...fallback, reason: `gemini_http_${generation.response.status}` };
    }
    const data = JSON.parse(generation.body) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      promptFeedback?: { blockReason?: string };
    };
    const contentText = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    if (!contentText) {
      console.error("[agent-webhook] Gemini returned no text", { promptFeedback: data.promptFeedback });
      return { ...fallback, reason: data.promptFeedback?.blockReason ? `gemini_blocked_${data.promptFeedback.blockReason}` : "gemini_empty_response" };
    }
    const parsed = parseAiReply(contentText);
    if (!parsed.reply) return fallback;
    console.info("[agent-webhook] AI generation complete", { replyLength: parsed.reply.length, needsHuman: parsed.needs_human });
    return parsed;
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
  const { content, media_url: mediaUrl = null, session_id: suppliedSessionId = null } = parsed.data;
  const chatId = parsed.data.chat_id ?? null;
  const openwaSessionId = parsed.data.openwa_session_id ?? null;
  const phone = parsed.data.phone ?? null;
  const sessionId = suppliedSessionId ?? (chatId ? `wa:${chatId}` : null);
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
  let leadIntent: string | null = null;
  const canonicalPhone = phone && !/@lid$/i.test(phone) ? phone : null;
  if (canonicalPhone) {
    const { data: existing } = await db
      .from("whatsapp_leads")
      .select("id, contact_name, ai_paused, status, closed_at, intent")
      .eq("user_id", userId)
      .eq("phone", canonicalPhone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
    aiPaused = Boolean(existing?.ai_paused);
    closed = Boolean(existing?.closed_at) || existing?.status === "closed";
    leadName = existing?.contact_name && existing.contact_name !== "Unknown" ? existing.contact_name : leadName;
    leadIntent = existing?.intent ?? null;
  }
  if (!leadId && sessionId) {
    const { data: existing } = await db
      .from("whatsapp_leads")
      .select("id, contact_name, ai_paused, status, closed_at, intent")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
    aiPaused = Boolean(existing?.ai_paused);
    closed = Boolean(existing?.closed_at) || existing?.status === "closed";
    leadName = existing?.contact_name && existing.contact_name !== "Unknown" ? existing.contact_name : leadName;
    leadIntent = existing?.intent ?? null;
  } else if (!leadId && phone) {
    const { data: existing } = await db
      .from("whatsapp_leads")
      .select("id, contact_name, ai_paused, status, closed_at, intent")
      .eq("user_id", userId)
      .eq("phone", phone)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    leadId = existing?.id ?? null;
    aiPaused = Boolean(existing?.ai_paused);
    closed = Boolean(existing?.closed_at) || existing?.status === "closed";
    leadName = existing?.contact_name && existing.contact_name !== "Unknown" ? existing.contact_name : leadName;
    leadIntent = existing?.intent ?? null;
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
        ...(suppliedName && suppliedName !== "Unknown" ? { contact_name: suppliedName } : {}),
        ...(phone ? { phone } : {}),
        ...(chatId ? { session_id: `wa:${chatId}` } : {}),
        last_message_at: new Date().toISOString(),
        inactivity_prompted_at: null,
        inactivity_alerted_at: null,
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
  const lastAgentMessage = [...history].reverse().find((turn) => turn.sender === "ai_agent")?.content ?? "";
  const { data: fleet } = await db
    .from("vehicles")
    .select("reg, make, model, year, fuel_type, status, next_mot_date, pco_expiry_date");

  const rawOption = parseMenuOption(content);

  if ((isNewLead || closed) && !isMenuReset(content) && !rawOption) {
    const reply = WELCOME_MENU;
    const outbound = await sendWelcomeMenu(chatId ?? phone, openwaSessionId ?? undefined);
    if (outbound.sent) {
      await db.from("whatsapp_leads").update({ status: "active", ai_paused: false, closed_at: null, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    }
    const telegram_alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `OpenWA reply failed: ${outbound.reason}`, leadId, history, mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, welcome_menu: outbound.sent, needs_human: !outbound.sent, telegram_alert, outbound });
  }

  if (isMenuReset(content)) {
    const reply = WELCOME_MENU;
    const outbound = await sendWelcomeMenu(chatId ?? phone, openwaSessionId ?? undefined);
    if (outbound.sent) {
      await db.from("whatsapp_leads").update({ status: "active", ai_paused: false, closed_at: null, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    }
    const telegram_alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `OpenWA reply failed: ${outbound.reason}`, leadId, history, mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, welcome_menu: outbound.sent, needs_human: !outbound.sent, telegram_alert, outbound });
  }

  if (isAbusiveMessage(content)) {
    const reply = "I’m unable to continue this automated conversation when abusive language is used. A human team member will review your message and contact you here.";
    await insertWithSessionFallback(db, "messages", {
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: reply,
      handoff: true,
      session_id: sessionId,
    });
    await db.from("whatsapp_leads").update({ status: "needs_human", ai_paused: true, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
    const alert = await sendTelegramAlert({
      name: leadName,
      phone,
      reason: "Abusive or profane customer message detected",
      leadId,
      history: [...history, { sender: "ai_agent", content: reply }],
      mediaUrl,
      closed: false,
    });
    return json({ ok: true, lead_id: leadId, reply, needs_human: true, ai_paused: true, telegram_alert: alert, outbound });
  }

  if (closed) {
    console.info("[agent-webhook] conversation closed; no AI reply", { leadId });
    return json({ ok: true, lead_id: leadId, closed: true, reply: null, needs_human: false });
  }

  if (aiPaused) {
    console.warn("[agent-webhook] reactivating AI after inbound customer message", { leadId });
    await db
      .from("whatsapp_leads")
      .update({ ai_paused: false, status: "active", closed_at: null } as never)
      .eq("id", leadId);
    aiPaused = false;
  }

  const option = rawOption ??
    (!leadIntent && isAccidentRequest(content) ? 2 : !leadIntent && isCarRequest(content) ? 1 : null);

  if (!option && leadIntent === "book_car" && lastAgentMessage.toLowerCase().includes("full name") && isLikelyFullName(content)) {
    const customerName = content.trim();
    const reply = formatCustomerFleet((fleet ?? []) as FleetVehicle[]);
    await db.from("whatsapp_leads").update({ contact_name: customerName, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
    return json({ ok: true, lead_id: leadId, reply, outbound, needs_human: !outbound.sent });
  }

  if (!option && leadIntent === "book_car" && findSelectedVehicle(content, (fleet ?? []) as FleetVehicle[]) && /(which vehicle|which car|available|fleet|vehicles currently marked)/i.test(lastAgentMessage)) {
    const selected = findSelectedVehicle(content, (fleet ?? []) as FleetVehicle[]);
    if (selected) {
      const reply = formatVehicleDetails(selected);
      const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
      if (outbound.sent) {
        await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
        await db.from("whatsapp_leads").update({ ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      }
      const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `OpenWA reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
      return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, needs_human: !outbound.sent, telegram_alert: alert });
    }
  }

  if (!option && leadIntent === "report_accident" && lastAgentMessage.toLowerCase().includes("full name") && isLikelyFullName(content)) {
    const customerName = content.trim();
    const reply = "Accident Support\n\nThank you, " + customerName + ". Please now send the vehicle registration, incident date, location, a short description of what happened, and any photos. A team member will review this promptly.";
    await db.from("whatsapp_leads").update({ contact_name: customerName, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
    return json({ ok: true, lead_id: leadId, reply, outbound, needs_human: !outbound.sent });
  }

  if (option === 1 || option === 2) {
    const reply = option === 1
      ? "Car Enquiry\n\nThank you for your interest in our PCO fleet. Before we look at available vehicles, could you please tell me your full name?"
      : "Accident Support\n\nWe are sorry to hear you've been in an accident. We are here to help guide you through the next steps safely.\n\nTo get started, please provide your full name:";
    const intent = option === 1 ? "book_car" : "report_accident";
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
    if (outbound.sent) {
      await insertWithSessionFallback(db, "messages", {
        user_id: userId,
        lead_id: leadId,
        sender: "ai_agent",
        content: reply,
        session_id: sessionId,
      });
      await db.from("whatsapp_leads").update({ intent, ai_summary: reply, ai_paused: false, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    }
    let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
    if (!outbound.sent) {
      alert = await sendTelegramAlert({ name: leadName, phone, reason: `OpenWA reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    }
    return json({ ok: true, lead_id: leadId, reply, needs_human: !outbound.sent, ai_paused: !outbound.sent, telegram_alert: alert, outbound });
  }

  if (!option && isTermsResponse(content) && lastAgentMessage.toLowerCase().includes("are you fully aware")) {
    const reply = "Thank you for contacting us. A team member will reply back to you within 24 hours to secure your place in this car.";
    await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, handoff: true, session_id: sessionId });
    await db.from("whatsapp_leads").update({ status: "needs_human", ai_paused: true, intent: leadIntent ?? "book_car", ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
    const alert = await sendTelegramAlert({ name: leadName, phone, reason: outbound.sent ? "Customer confirmed vehicle terms" : `OpenWA reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply, needs_human: true, telegram_alert: alert, outbound });
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
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
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
    const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: reply, sessionId: openwaSessionId ?? undefined });
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

  console.info("[agent-webhook] awaiting AI response", { leadId, historyLength: history.length, fleetCount: fleet?.length ?? 0 });
  const ai = await generateReply(
    history,
    content,
    Boolean(mediaUrl),
    (fleet ?? []) as FleetVehicle[],
  );
  console.info("[agent-webhook] AI response ready", { leadId, needsHuman: ai.needs_human, replyLength: ai.reply.length });
  const needsHuman = Boolean(ai.needs_human);
  const finalReply =
    needsHuman && !ai.reply ? "I’m connecting you with a member of our team now." : ai.reply;
  console.info("[agent-webhook] awaiting OpenWA AI dispatch", { leadId, transportSession: openwaSessionId ?? "vch-bot", chatId: chatId ?? phone, hasPhone: Boolean(phone || chatId) });
  const outbound = await sendOpenWaText({ phone: chatId ?? phone, text: finalReply, sessionId: openwaSessionId ?? undefined });
  if (outbound.sent) {
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
  }
  console.info("[agent-webhook] OpenWA AI dispatch complete", { leadId, sent: outbound.sent, reason: outbound.sent ? undefined : outbound.reason });
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
