import { callGeminiProvider, callSecondaryProvider, sanitizeErrorMessage } from "@/lib/ai-providers";
import { getVehicleWeeklyPrice, getVehicleDefaultDeposit } from "@/lib/fleet-data";

export type LeadContext = {
  driver_name?: string | null;
  age?: number | null;
  pco_badge?: boolean | null;
  penalty_points?: number | null;
  preferred_vehicles?: string[] | null;
  start_date?: string | null;
  notes?: string | null;
  stage?: string;
  paused_reason?: string | null;
};

export type FleetVehicleItem = {
  id: string;
  make: string;
  model: string;
  year: number;
  fuel_type: string;
  weekly_rent: number;
  monthly_mileage_allowance: number;
  status: string;
  registration?: string;
  default_deposit?: number;
};

export type ToolCallResult = {
  toolName: string;
  args: any;
  result: any;
};

export type AgentTurnResult = {
  reply: string;
  needs_human: boolean;
  reason: string;
  stage?: string;
  updatedContext: LeadContext;
  toolCallsExecuted: ToolCallResult[];
  validationError?: string;
  providerUsed?: string;
  modelUsed?: string;
  latencyMs?: number;
};

// --- Available Function Tools ---
export const AGENT_TOOLS = [
  {
    name: "find_vehicles",
    description: "Find vehicles in fleet using loose name queries (e.g. e220, 'mg 5', prius, tourneo, corolla, tesla) or filters. Returns weekly rent, year, fuel, mileage allowance, minimum term, and availability status.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Search query or model name (e.g. e220, mg 5, prius, tourneo, corolla, model 3)" },
        fuel_type: { type: "STRING", description: "Filter by fuel type: Electric, Plug-in-Hybrid, Petrol, Diesel, Hybrid" },
        max_price: { type: "NUMBER", description: "Maximum weekly rent in GBP" },
      },
    },
  },
  {
    name: "get_fleet",
    description: "Query available vehicles from live database fleet filtered by fuel type or max price.",
    parameters: {
      type: "OBJECT",
      properties: {
        fuel_type: { type: "STRING", description: "Filter by fuel type: Electric, Plug-in-Hybrid, Petrol, Diesel, Hybrid" },
        max_price: { type: "NUMBER", description: "Maximum weekly rent in GBP" },
      },
    },
  },
  {
    name: "get_vehicle",
    description: "Get exact details (weekly rent, year, fuel type, mileage allowance, deposit, status) for a specific vehicle model name.",
    parameters: {
      type: "OBJECT",
      properties: {
        vehicle_name: { type: "STRING", description: "Name or make/model of the vehicle (e.g. Toyota Auris, Mercedes E220d, Tourneo Custom, Tesla Model 3)" },
      },
      required: ["vehicle_name"],
    },
  },
  {
    name: "compare_vehicles",
    description: "Compare specifications, weekly rent rates, and fuel types for multiple vehicles.",
    parameters: {
      type: "OBJECT",
      properties: {
        vehicle_names: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "List of vehicle names to compare",
        },
      },
      required: ["vehicle_names"],
    },
  },
  {
    name: "save_lead_field",
    description: "Save or update structured customer lead information into the CRM lead record.",
    parameters: {
      type: "OBJECT",
      properties: {
        field: {
          type: "STRING",
          description: "Field name: driver_name, age, pco_badge, penalty_points, preferred_vehicles, start_date, notes",
        },
        value: { type: "STRING", description: "Value to store for the specified field" },
      },
      required: ["field", "value"],
    },
  },
  {
    name: "set_stage",
    description: "Update the customer lifecycle stage in CRM.",
    parameters: {
      type: "OBJECT",
      properties: {
        stage: {
          type: "STRING",
          description: "Stage: inquiry, eligibility_check, vehicle_selected, terms_confirmed, breakdown, accident, handoff_ready",
        },
      },
      required: ["stage"],
    },
  },
  {
    name: "request_human_handoff",
    description: "Request immediate handoff to a human team member (e.g. price negotiation, complex query, complaints, angry customer).",
    parameters: {
      type: "OBJECT",
      properties: {
        reason: { type: "STRING", description: "Clear reason for handing off to human agent" },
      },
      required: ["reason"],
    },
  },
  {
    name: "start_breakdown_case",
    description: "Initiate emergency vehicle breakdown flow with registration, location, and issue.",
    parameters: {
      type: "OBJECT",
      properties: {
        reg: { type: "STRING", description: "Vehicle registration mark" },
        location: { type: "STRING", description: "Current breakdown location or landmark" },
        issue: { type: "STRING", description: "Brief description of the vehicle fault or emergency" },
      },
    },
  },
];

export function matchVehicleLoosely(query: string, vehicle: FleetVehicleItem): boolean {
  if (!query || !query.trim()) return true;
  const q = query.toLowerCase().replace(/[^a-z0-9]/g, "");
  const full = `${vehicle.make} ${vehicle.model}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const make = vehicle.make.toLowerCase().replace(/[^a-z0-9]/g, "");
  const model = vehicle.model.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (full.includes(q) || q.includes(model) || q.includes(make)) return true;

  // Specific loose aliases
  if (q.includes("e220") && full.includes("e220")) return true;
  if ((q.includes("mg5") || q.includes("mg")) && full.includes("mg")) return true;
  if (q.includes("prius") && full.includes("prius")) return true;
  if (q.includes("tourneo") && full.includes("tourneo")) return true;
  if (q.includes("corolla") && full.includes("corolla")) return true;
  if (q.includes("auris") && full.includes("auris")) return true;
  if (q.includes("tesla") && full.includes("tesla")) return true;

  return false;
}

export function formatAvailabilityStatus(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "available" || s === "active" || s === "in_stock" || s === "instock") {
    return "Available (Ready to rent)";
  }
  if (s === "rented") {
    return "Rented (Currently out with driver)";
  }
  if (s === "inservice" || s === "in_service" || s === "maintenance" || s === "offroad" || s === "off_road") {
    return "In Service / Maintenance (Currently unavailable)";
  }
  return `${status || "Available"} (Ready to rent)`;
}

// --- Execute Tool Function Against Database Fleet ---
export function executeToolCall(
  toolName: string,
  args: any,
  fleet: FleetVehicleItem[],
  context: LeadContext,
): { result: any; updatedContext: LeadContext; triggerHandoff?: boolean; handoffReason?: string } {
  const nextContext = { ...context };

  if (toolName === "find_vehicles") {
    const q = String(args?.query || "").trim();
    let matches = fleet;

    if (q) {
      matches = matches.filter((v) => matchVehicleLoosely(q, v));
    }
    if (args?.fuel_type) {
      const ft = String(args.fuel_type).toLowerCase();
      matches = matches.filter((v) => v.fuel_type.toLowerCase().includes(ft));
    }
    if (args?.max_price && typeof args.max_price === "number") {
      matches = matches.filter((v) => (v.weekly_rent || getVehicleWeeklyPrice(`${v.make} ${v.model}`)) <= args.max_price);
    }

    const items = matches.map((v) => ({
      name: `${v.make} ${v.model}`,
      year: v.year,
      fuel_type: v.fuel_type,
      weekly_rent: `£${v.weekly_rent || getVehicleWeeklyPrice(`${v.make} ${v.model}`)}/week`,
      monthly_mileage_allowance: `${v.monthly_mileage_allowance || 2500} miles/month`,
      deposit: `£${v.default_deposit || getVehicleDefaultDeposit(`${v.make} ${v.model}`)}`,
      minimum_term: "6 weeks",
      status: formatAvailabilityStatus(v.status),
    }));

    return {
      result: {
        total_found: matches.length,
        status_definitions: "Active/Available = available for hire; Rented/In Service/Off Road = currently unavailable.",
        vehicles: items.slice(0, 10),
      },
      updatedContext: nextContext,
    };
  }

  if (toolName === "get_fleet") {
    let matches = fleet.filter((v) => v.status === "available" || v.status === "active" || v.status === "in_stock" || !v.status);
    if (matches.length === 0) matches = fleet;

    if (args?.fuel_type) {
      const ft = String(args.fuel_type).toLowerCase();
      matches = matches.filter((v) => v.fuel_type.toLowerCase().includes(ft));
    }
    if (args?.max_price && typeof args.max_price === "number") {
      matches = matches.filter((v) => (v.weekly_rent || getVehicleWeeklyPrice(`${v.make} ${v.model}`)) <= args.max_price);
    }

    const items = matches.slice(0, 8).map((v) => ({
      name: `${v.make} ${v.model}`,
      year: v.year,
      fuel_type: v.fuel_type,
      weekly_rent: `£${v.weekly_rent || getVehicleWeeklyPrice(`${v.make} ${v.model}`)}/week`,
      mileage_allowance: `${v.monthly_mileage_allowance || 2500} miles/month`,
      deposit: `£${v.default_deposit || getVehicleDefaultDeposit(`${v.make} ${v.model}`)}`,
    }));

    return { result: { available_count: matches.length, vehicles: items }, updatedContext: nextContext };
  }

  if (toolName === "get_vehicle") {
    const search = String(args?.vehicle_name || "").toLowerCase().trim();
    const match = fleet.find((v) => {
      const full = `${v.make} ${v.model}`.toLowerCase();
      return full.includes(search) || search.includes(v.model.toLowerCase());
    });

    if (!match) {
      return {
        result: {
          found: false,
          message: `Vehicle '${args?.vehicle_name}' not found in live database fleet. A team member will confirm availability and pricing.`,
        },
        updatedContext: nextContext,
      };
    }

    const weeklyPrice = match.weekly_rent || getVehicleWeeklyPrice(`${match.make} ${match.model}`);
    const deposit = match.default_deposit || getVehicleDefaultDeposit(`${match.make} ${match.model}`);

    if (!nextContext.preferred_vehicles) nextContext.preferred_vehicles = [];
    if (!nextContext.preferred_vehicles.includes(`${match.make} ${match.model}`)) {
      nextContext.preferred_vehicles.push(`${match.make} ${match.model}`);
    }

    return {
      result: {
        found: true,
        name: `${match.make} ${match.model}`,
        year: match.year,
        fuel_type: match.fuel_type,
        weekly_rent: `£${weeklyPrice}/week`,
        monthly_mileage_allowance: `${match.monthly_mileage_allowance || 2500} miles/month`,
        deposit: `£${deposit}`,
        minimum_term: "6 weeks",
        status: match.status || "available",
      },
      updatedContext: nextContext,
    };
  }

  if (toolName === "compare_vehicles") {
    const names: string[] = Array.isArray(args?.vehicle_names) ? args.vehicle_names : [];
    const comparisons = names.map((name) => {
      const search = name.toLowerCase().trim();
      const match = fleet.find((v) => `${v.make} ${v.model}`.toLowerCase().includes(search) || search.includes(v.model.toLowerCase()));
      if (!match) {
        return { name, found: false, note: "Specs to be confirmed by team member" };
      }
      return {
        name: `${match.make} ${match.model}`,
        found: true,
        year: match.year,
        fuel_type: match.fuel_type,
        weekly_rent: `£${match.weekly_rent || getVehicleWeeklyPrice(`${match.make} ${match.model}`)}/week`,
        mileage_allowance: `${match.monthly_mileage_allowance || 2500} miles/month`,
        deposit: `£${match.default_deposit || getVehicleDefaultDeposit(`${match.make} ${match.model}`)}`,
      };
    });

    return { result: { comparisons }, updatedContext: nextContext };
  }

  if (toolName === "save_lead_field") {
    const field = String(args?.field || "").toLowerCase();
    const val = args?.value;

    if (field === "driver_name" || field === "name") nextContext.driver_name = String(val);
    else if (field === "age") nextContext.age = Number(val) || null;
    else if (field === "pco_badge" || field === "pco") nextContext.pco_badge = Boolean(val);
    else if (field === "penalty_points" || field === "points") nextContext.penalty_points = Number(val) ?? 0;
    else if (field === "preferred_vehicles" || field === "vehicle") {
      nextContext.preferred_vehicles = Array.isArray(val) ? val : [String(val)];
    } else if (field === "start_date") nextContext.start_date = String(val);
    else if (field === "notes") nextContext.notes = String(val);

    return { result: { saved: true, field, value: val }, updatedContext: nextContext };
  }

  if (toolName === "set_stage") {
    const stage = String(args?.stage || "inquiry");
    nextContext.stage = stage;
    return { result: { stage_updated: stage }, updatedContext: nextContext };
  }

  if (toolName === "request_human_handoff") {
    const reason = String(args?.reason || "Customer requested human assistant");
    nextContext.stage = "handoff_ready";
    return {
      result: { handoff_requested: true, reason },
      updatedContext: nextContext,
      triggerHandoff: true,
      handoffReason: reason,
    };
  }

  if (toolName === "start_breakdown_case") {
    nextContext.stage = "breakdown";
    return {
      result: {
        breakdown_started: true,
        reg: args?.reg || null,
        location: args?.location || null,
        issue: args?.issue || null,
        instructions: "Advise customer to stop safely, call 999 if in danger, and provide exact location and reg.",
      },
      updatedContext: nextContext,
    };
  }

  return { result: { error: `Unknown tool ${toolName}` }, updatedContext: nextContext };
}

export function sanitizeOutgoingMessage(message: string): string {
  if (!message) return "";

  let cleaned = message
    // 1. Strip em dashes (—) and en dashes (–)
    .replace(/[\u2014\u2013—–]/g, " ")
    // 2. Remove markdown headings (# Heading, ## Heading, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // 3. Clean double spaces
    .replace(/ {2,}/g, " ")
    .trim();

  // 4. Cap length to max 1200 characters if over limit
  if (cleaned.length > 1200) {
    cleaned = cleaned.slice(0, 1200).trim() + "…";
  }

  return cleaned;
}

// --- Reply Validator & Output Guard ---
export function validateAiReply(
  reply: string,
  lastBotMessage?: string,
  knownPrices?: number[],
): { valid: boolean; reason?: string } {
  if (!reply || reply.trim().length < 3) {
    return { valid: false, reason: "Reply is empty or too short" };
  }

  const trimmed = reply.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return { valid: false, reason: "Reply contains raw JSON output" };
  }
  if (/get_fleet|get_vehicle|compare_vehicles|find_vehicles|save_lead_field|set_stage/i.test(trimmed)) {
    return { valid: false, reason: "Reply contains unexecuted function tool call text" };
  }

  // Guard: Block "Price to confirm", any £0 / 0 pound price, or unconfirmed price phrases
  if (/price to confirm|price tbc|0\s*(?:pound|gbp)|£\s*0\b/i.test(trimmed)) {
    return { valid: false, reason: "Reply contains 'Price to confirm' or zero/invalid price" };
  }

  if (lastBotMessage && trimmed.toLowerCase() === lastBotMessage.trim().toLowerCase()) {
    return { valid: false, reason: "Reply is an exact repeat of the previous bot message" };
  }

  const priceMatches = trimmed.match(/£\s*(\d+)/g);
  if (priceMatches && knownPrices && knownPrices.length > 0) {
    const standardValidPrices = [500, 1000, 200, 250, 260, 300, 320, 340, 350, 360, 380, 400, 450, 500, 600];
    const allowed = new Set([...knownPrices, ...standardValidPrices]);

    for (const match of priceMatches) {
      const num = parseInt(match.replace(/£\s*/, ""), 10);
      if (num === 0) {
        return { valid: false, reason: "Reply contains zero price £0" };
      }
      if (!allowed.has(num) && num > 50) {
        return { valid: false, reason: `Unverified price £${num} mentioned in reply not present in tool data` };
      }
    }
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 180) {
    return { valid: false, reason: "Reply is excessively long (>180 words)" };
  }

  return { valid: true };
}

import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_SYSTEM_PROMPT = `You are Virtual Car Hire's live WhatsApp assistant. Help London private hire (PCO) drivers find and rent vehicles from our fleet, report breakdowns, and report accidents.

Core Guidelines:
- You represent Virtual Car Hire, London's leading PCO car rental company.
- Sound like a friendly, professional UK human agent. Be warm, concise, and helpful.
- Reply in the customer's language if they speak non-English (e.g., Urdu, Polish).
- Remove every hard-coded vehicle list, price, age rule or policy. All vehicle facts come from tools (find_vehicles, get_vehicle, compare_vehicles).
- NEVER guess, invent, or hardcode vehicle prices, fuel types, specs, or policies.
- If a detail (like deposit amount or specific policy) is not provided by a tool or is unknown, inform the customer that a team member will confirm it for them, and call request_human_handoff.

Booking Flow:
When a customer wants to rent or enquire about a vehicle:
1. Collect their details: Full Name, Age, PCO Badge status (Yes/No), Penalty Points (number), Preferred Vehicle(s), and Desired Start Date.
2. Save each detail using save_lead_field as soon as provided.
3. If the customer says No to age or eligibility, handle it politely (e.g., ask their age once to clarify without looping).
4. Once details are collected, summarise the information for the customer and call request_human_handoff to hand over to the team.

Vehicle Inquiries:
- Call find_vehicles to search for vehicles matching loose queries (e.g. "e220", "mg 5", "prius", "tourneo").
- Present real vehicle facts returned by tools (weekly rent, year, fuel type, mileage allowance, minimum term, availability status).
- Status meanings: Active/Available means available for rental; Rented, In Service, or Off Road means currently unavailable.

Handling Issues & Handoffs:
- Emergency Breakdown: Call start_breakdown_case with reg, location, and issue, and provide garage guidance.
- Price Negotiation / Unknown Deposit / Complex Requests / Angry Customer: Call request_human_handoff so the team can confirm and assist.
- NEVER output raw JSON, function call syntax, markdown headings (#), or em/en dashes (— / –) in customer messages.`;

export async function getSystemPromptFromDb(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("bot_settings" as any)
      .select("value")
      .eq("key", "system_prompt")
      .maybeSingle();

    if (error || !data?.value?.trim()) {
      return DEFAULT_SYSTEM_PROMPT;
    }
    return data.value;
  } catch {
    return DEFAULT_SYSTEM_PROMPT;
  }
}

// --- System Prompt Generator ---
export function buildSystemPrompt(context: LeadContext, fleet: FleetVehicleItem[], customPromptText?: string): string {
  const promptText = customPromptText?.trim() || DEFAULT_SYSTEM_PROMPT;

  const summaryLines: string[] = [];
  if (context.driver_name) summaryLines.push(`Customer Name: ${context.driver_name}`);
  if (context.age !== undefined && context.age !== null) summaryLines.push(`Age: ${context.age}`);
  if (context.pco_badge !== undefined && context.pco_badge !== null) summaryLines.push(`PCO Badge: ${context.pco_badge ? "Yes" : "No"}`);
  if (context.penalty_points !== undefined && context.penalty_points !== null) summaryLines.push(`Licence Points: ${context.penalty_points}`);
  if (context.preferred_vehicles && context.preferred_vehicles.length > 0) {
    summaryLines.push(`Selected/Requested Vehicle(s): ${context.preferred_vehicles.join(", ")}`);
  }
  if (context.start_date) summaryLines.push(`Desired Start Date: ${context.start_date}`);
  if (context.stage) summaryLines.push(`Current CRM Stage: ${context.stage}`);

  const leadSummaryText = summaryLines.length > 0
    ? `\n\nSTRUCTURED LEAD SUMMARY (DO NOT RE-ASK DETAILS ALREADY HERE):\n${summaryLines.join("\n")}\n`
    : "\n\nSTRUCTURED LEAD SUMMARY: No details collected yet.\n";

  return `${promptText}${leadSummaryText}`;
}

// --- Main Agent Execution Loop ---
export async function runAgentTurn(params: {
  history: Array<{ sender: string; content: string }>;
  latest: string;
  context: LeadContext;
  fleet: FleetVehicleItem[];
  lastBotMessage?: string;
  chatId?: string;
  customSystemPrompt?: string;
}): Promise<AgentTurnResult> {
  let currentContext = { ...params.context };
  const executedToolCalls: ToolCallResult[] = [];
  const knownPrices: number[] = [];

  const basePromptText = params.customSystemPrompt || (await getSystemPromptFromDb());
  const systemPrompt = buildSystemPrompt(currentContext, params.fleet, basePromptText);

  const historyText = params.history
    .slice(-20)
    .map((m) => `${m.sender === "ai_agent" ? "Agent" : "Customer"}: ${m.content}`)
    .join("\n");

  const userText = (historyText ? `Conversation History:\n${historyText}\n\n` : "") + `New Message: ${params.latest}`;

  let rawReply = "";
  let needsHuman = false;
  let handoffReason = "";
  let providerUsed = "gemini";
  let modelUsed = "gemini-3.6-flash";
  let latencyMs = 0;

  const start = Date.now();

  try {
    const primaryRes = await callGeminiProvider({
      system: systemPrompt,
      userText,
      tools: [{ functionDeclarations: AGENT_TOOLS }],
    });

    rawReply = primaryRes.reply;
    modelUsed = primaryRes.model;
    latencyMs = primaryRes.latencyMs;

    if (primaryRes.toolCalls && primaryRes.toolCalls.length > 0) {
      for (const call of primaryRes.toolCalls) {
        const toolRes = executeToolCall(call.name, call.args, params.fleet, currentContext);
        currentContext = toolRes.updatedContext;
        executedToolCalls.push({ toolName: call.name, args: call.args, result: toolRes.result });

        if (toolRes.triggerHandoff) {
          needsHuman = true;
          handoffReason = toolRes.handoffReason || "Human handoff requested";
        }

        if (toolRes.result?.vehicles) {
          toolRes.result.vehicles.forEach((v: any) => {
            const num = parseInt(String(v.weekly_rent).replace(/\D/g, ""), 10);
            if (num) knownPrices.push(num);
          });
        }
        if (toolRes.result?.weekly_rent) {
          const num = parseInt(String(toolRes.result.weekly_rent).replace(/\D/g, ""), 10);
          if (num) knownPrices.push(num);
        }
      }

      if (!rawReply && executedToolCalls.length > 0) {
        const toolSummary = executedToolCalls.map((tc) => `Tool ${tc.toolName}(${JSON.stringify(tc.args)}) -> ${JSON.stringify(tc.result)}`).join("\n");
        const followUpPrompt = `${userText}\n\nTool Results:\n${toolSummary}\nNow reply naturally to the customer using ONLY these verified tool results.`;

        const followUpRes = await callGeminiProvider({
          system: systemPrompt,
          userText: followUpPrompt,
        });
        rawReply = followUpRes.reply;
      }
    }
  } catch (err: any) {
    console.warn("[ai-agent] Primary Gemini turn failed, trying secondary fallback:", err.message || err);
    try {
      const secondaryRes = await callSecondaryProvider({
        system: systemPrompt,
        userText,
      });
      rawReply = secondaryRes.reply;
      providerUsed = secondaryRes.provider;
      modelUsed = secondaryRes.model;
      latencyMs = secondaryRes.latencyMs;
    } catch (secErr: any) {
      console.error("[ai-agent] Secondary fallback turn also failed:", secErr.message || secErr);
      currentContext.paused_reason = "ai_down";
      return {
        reply: "Thanks, one of our team will reply shortly.",
        needs_human: true,
        reason: "all_ai_providers_failed",
        updatedContext: currentContext,
        toolCallsExecuted: executedToolCalls,
        providerUsed: "none",
        modelUsed: "none",
        latencyMs: Date.now() - start,
      };
    }
  }

  // 2. Validate Generated Reply
  const validation = validateAiReply(rawReply, params.lastBotMessage, knownPrices);

  if (!validation.valid) {
    console.warn(`[ai-agent] Reply validation failed (${validation.reason}). Regenerating with corrective instruction...`);

    try {
      const correctivePrompt = `${userText}\n\nPREVIOUS GENERATED REPLY: "${rawReply}"\nERROR: ${validation.reason}.\nInstruction: Provide a concise, friendly response in plain UK English addressing the customer directly. Do not repeat previous text, do not output raw JSON or code, and use only verified prices from tools.`;

      const retryRes = await callGeminiProvider({
        system: systemPrompt,
        userText: correctivePrompt,
      });

      const retryValidation = validateAiReply(retryRes.reply, params.lastBotMessage, knownPrices);
      if (retryValidation.valid) {
        rawReply = retryRes.reply;
      } else {
        console.error("[ai-agent] Corrective regeneration also failed validation. Handing off to human.");
        return {
          reply: "Thanks, one of our team will reply shortly.",
          needs_human: true,
          reason: `reply_validation_failed: ${validation.reason}`,
          updatedContext: currentContext,
          toolCallsExecuted: executedToolCalls,
          validationError: validation.reason,
          providerUsed,
          modelUsed,
          latencyMs: Date.now() - start,
        };
      }
    } catch {
      return {
        reply: "Thanks, one of our team will reply shortly.",
        needs_human: true,
        reason: `reply_validation_failed: ${validation.reason}`,
        updatedContext: currentContext,
        toolCallsExecuted: executedToolCalls,
        validationError: validation.reason,
        providerUsed,
        modelUsed,
        latencyMs: Date.now() - start,
      };
    }
  }

  return {
    reply: sanitizeOutgoingMessage(rawReply),
    needs_human: needsHuman,
    reason: handoffReason || "ok",
    stage: currentContext.stage,
    updatedContext: currentContext,
    toolCallsExecuted: executedToolCalls,
    providerUsed,
    modelUsed,
    latencyMs: Date.now() - start,
  };
}
