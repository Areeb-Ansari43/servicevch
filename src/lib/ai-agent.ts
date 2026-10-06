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
    description: "Get exact details (weekly rent, year, fuel type, mileage allowance, deposit) for a specific vehicle model name.",
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

// --- Execute Tool Function Against Database Fleet ---
export function executeToolCall(
  toolName: string,
  args: any,
  fleet: FleetVehicleItem[],
  context: LeadContext,
): { result: any; updatedContext: LeadContext; triggerHandoff?: boolean; handoffReason?: string } {
  const nextContext = { ...context };

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

// --- Reply Validator ---
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
  if (/get_fleet|get_vehicle|compare_vehicles|save_lead_field|set_stage/i.test(trimmed)) {
    return { valid: false, reason: "Reply contains unexecuted function tool call text" };
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

// --- System Prompt Generator ---
export function buildSystemPrompt(context: LeadContext, fleet: FleetVehicleItem[]): string {
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
    ? `\nSTRUCTURED LEAD SUMMARY (DO NOT RE-ASK DETAILS ALREADY HERE):\n${summaryLines.join("\n")}\n`
    : "\nSTRUCTURED LEAD SUMMARY: No details collected yet.\n";

  return `You are the friendly, professional WhatsApp AI assistant for Virtual Car Hire (VCH), London's leading PCO and private-hire car rental company.

COMPANY & CONTRACT INFORMATION:
- Company: Virtual Car Hire (4.8 stars on Google & Trustpilot).
- Minimum Term: 6 weeks minimum rental contract (rolling weekly thereafter).
- What's Included: Vehicle maintenance, servicing, tyres, roadside assistance, licensing & PCO document upload support.
- Requirements: Valid UK PCO licence, age 25+ (under 25 requires team review), maximum 6 penalty points, UK driving licence.
- Deposit: Standard deposit is £500 (£1,000 for Mercedes EQE/EQS).

CONVERSATION & TONE RULES:
- Sound like a helpful UK human agent: concise, warm, natural, and polite.
- Use the customer's name once known (e.g. "Hi John,").
- Keep normal replies brief (1 to 4 short sentences, under 80 words) unless answering a specific multi-car comparison request.
- Never repeat template headers, welcome menus, or previous messages.
- ALWAYS reply in the same language as the customer if they speak non-English.

CRITICAL DATA & PRICE VERIFICATION RULES:
- EVERY price (£), year, fuel type, and mileage allowance MUST come strictly from tool results (get_fleet, get_vehicle, compare_vehicles).
- NEVER guess, invent, or hardcode prices or specs. If a vehicle or price is missing from tool results, say: "A team member will confirm the exact price and details for you."
- When a customer names a vehicle (e.g., "Toyota Auris Estate", "Mercedes E220d", "Tourneo Custom"), call get_vehicle or compare_vehicles first, then provide exact weekly rent, year, fuel type (e.g. Mercedes E220d is Diesel!), and mileage allowance.
- If a customer asks to negotiate prices, change terms, lower rent, or request extra miles, politely explain that rates are fixed and offer to hand off to a team member.
- If a customer is angry, asks for a human, asks about legal/insurance claims, or asks complex policy questions twice, call request_human_handoff immediately.
- Only start the breakdown flow on CLEAR intent (e.g. "broke down", "accident", "won't start", "flat tyre", "stuck").

TOOLS AVAILABLE:
Use function calling tools whenever querying vehicle data, saving customer eligibility, updating CRM stage, or requesting human handoff.

${leadSummaryText}`;
}

// --- Main Agent Execution Loop ---
export async function runAgentTurn(params: {
  history: Array<{ sender: string; content: string }>;
  latest: string;
  context: LeadContext;
  fleet: FleetVehicleItem[];
  lastBotMessage?: string;
  chatId?: string;
}): Promise<AgentTurnResult> {
  let currentContext = { ...params.context };
  const executedToolCalls: ToolCallResult[] = [];
  const knownPrices: number[] = [];

  const systemPrompt = buildSystemPrompt(currentContext, params.fleet);

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
    reply: rawReply,
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
