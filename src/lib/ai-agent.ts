import { callGeminiProvider, callSecondaryProvider, sanitizeErrorMessage } from "@/lib/ai-providers";
import { getVehicleWeeklyPrice, getVehicleDefaultDeposit } from "@/lib/fleet-data";
import {
  DEFAULT_BOT_CATALOG,
  getBotCatalogFromDb,
  evaluateFleetAvailability,
  type BotCatalogEntry,
  type CrmVehicle,
} from "@/lib/bot-catalog";

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
    name: "list_available_vehicles",
    description: "List available rental cars matching optional filters (fuel_group, max_rent, min_term, max_term). 'hybrid' matches Hybrid and Plug-in-Hybrid. 'plug_in_hybrid' matches plug-in only. Returns available cars sorted cheapest first (max 5 per reply).",
    parameters: {
      type: "OBJECT",
      properties: {
        fuel_group: {
          type: "STRING",
          description: "Fuel group filter: 'hybrid' (both hybrid and plug-in), 'plug_in_hybrid', 'electric', 'diesel', 'petrol'",
        },
        max_rent: { type: "NUMBER", description: "Maximum weekly rent in GBP" },
        min_term: { type: "NUMBER", description: "Minimum rental term weeks" },
        max_term: { type: "NUMBER", description: "Maximum rental term weeks" },
      },
    },
  },
  {
    name: "find_vehicles",
    description: "Find vehicles in fleet using loose name queries (e.g. e220, 'mg 5', prius, tourneo, corolla, tesla, santa fe). Returns weekly rent, deposit, monthly miles, minimum term, year, fuel, and availability status for every car mentioned.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Search query or model name (e.g. e220, mg 5, prius, tourneo, corolla, model 3, santa fe)" },
        fuel_type: { type: "STRING", description: "Filter by fuel type: Electric, Plug-in-Hybrid, Petrol, Diesel, Hybrid" },
        max_price: { type: "NUMBER", description: "Maximum weekly rent in GBP" },
      },
      required: ["query"],
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
  customCatalog?: BotCatalogEntry[],
): { result: any; updatedContext: LeadContext; triggerHandoff?: boolean; handoffReason?: string } {
  const nextContext = { ...context };

  const crmVehicles: CrmVehicle[] = fleet.map((f) => ({
    id: f.id,
    reg: f.registration || f.id,
    make: f.make,
    model: f.model,
    year: f.year,
    fuel_type: f.fuel_type,
    status: f.status,
    next_mot_date: (f as any).next_mot_date,
    pco_expiry_date: (f as any).pco_expiry_date,
  }));

  const catalogToUse = customCatalog && customCatalog.length > 0 ? customCatalog : DEFAULT_BOT_CATALOG;
  const { summaries } = evaluateFleetAvailability(catalogToUse, crmVehicles);

  if (toolName === "list_available_vehicles") {
    let availableEntries = summaries.filter((s) => s.isAvailable);

    if (args?.fuel_group) {
      const fg = String(args.fuel_group).toLowerCase().trim();
      if (fg === "hybrid") {
        availableEntries = availableEntries.filter(
          (s) => s.catalog.fuel_group === "hybrid" || s.catalog.fuel_group === "plug_in_hybrid",
        );
      } else if (fg === "plug_in_hybrid" || fg === "phev") {
        availableEntries = availableEntries.filter((s) => s.catalog.fuel_group === "plug_in_hybrid");
      } else if (fg === "electric" || fg === "ev") {
        availableEntries = availableEntries.filter((s) => s.catalog.fuel_group === "electric");
      } else if (fg === "diesel") {
        availableEntries = availableEntries.filter((s) => s.catalog.fuel_group === "diesel");
      } else if (fg === "petrol") {
        availableEntries = availableEntries.filter((s) => s.catalog.fuel_group === "petrol");
      }
    }

    if (typeof args?.max_rent === "number") {
      availableEntries = availableEntries.filter((s) => s.catalog.weekly_rent <= args.max_rent);
    }
    if (typeof args?.min_term === "number") {
      availableEntries = availableEntries.filter((s) => s.catalog.minimum_term_weeks >= args.min_term);
    }

    // Sort cheapest first
    availableEntries.sort((a, b) => a.catalog.weekly_rent - b.catalog.weekly_rent);

    const items = availableEntries.slice(0, 5).map((s) => ({
      car: s.catalog.display_name,
      weekly_rent: `£${s.catalog.weekly_rent}/week`,
      deposit: s.catalog.deposit ? `£${s.catalog.deposit}` : "to be confirmed by team",
      fuel: s.catalog.fuel_type || "to be confirmed by team",
      year: s.catalog.year_label,
      monthly_miles: `${s.catalog.monthly_miles} miles/month`,
      minimum_term: `${s.catalog.minimum_term_weeks} weeks`,
      available_now: true,
      rentable_units: s.rentableVehicles.length,
    }));

    const fallbackSuggestions =
      items.length === 0
        ? summaries
            .filter((s) => s.isAvailable)
            .sort((a, b) => a.catalog.weekly_rent - b.catalog.weekly_rent)
            .slice(0, 3)
            .map((s) => ({
              car: s.catalog.display_name,
              weekly_rent: `£${s.catalog.weekly_rent}/week`,
              fuel: s.catalog.fuel_type || "TBC",
              year: s.catalog.year_label,
            }))
        : [];

    return {
      result: {
        matches_found: items.length,
        vehicles: items,
        fallback_available_suggestions: fallbackSuggestions,
        message:
          items.length === 0
            ? "No cars matching those specific filters are available at the moment."
            : undefined,
      },
      updatedContext: nextContext,
    };
  }

  if (toolName === "find_vehicles") {
    const qRaw = String(args?.query || "").toLowerCase();
    const qClean = qRaw.replace(/[^a-z0-9]/g, "");

    let matchedSummaries = summaries.filter((s) => {
      const dClean = s.catalog.display_name.toLowerCase().replace(/[^a-z0-9]/g, "");
      const mClean = s.catalog.model.toLowerCase().replace(/[^a-z0-9]/g, "");
      const kClean = s.catalog.make.toLowerCase().replace(/[^a-z0-9]/g, "");

      // If user specified year like 2026, ensure exact subversion matching
      if (qClean.includes("2026") && !dClean.includes("2026")) {
        return false;
      }
      if ((qClean.includes("2023") || qClean.includes("2024") || qClean.includes("2025")) && dClean.includes("2026")) {
        return false;
      }

      if (dClean.includes(qClean) || qClean.includes(dClean) || qClean.includes(mClean) || qClean.includes(kClean)) {
        return true;
      }
      return (s.catalog.aliases || []).some((al) => {
        const alClean = al.toLowerCase().replace(/[^a-z0-9]/g, "");
        return qClean.includes(alClean) || alClean.includes(qClean);
      });
    });

    const items = matchedSummaries.map((s) => ({
      name: s.catalog.display_name,
      car: s.catalog.display_name,
      weekly_rent: `£${s.catalog.weekly_rent}/week`,
      deposit: s.catalog.deposit ? `£${s.catalog.deposit}` : "to be confirmed by team",
      fuel_type: s.catalog.fuel_type || "to be confirmed by team",
      fuel: s.catalog.fuel_type || "to be confirmed by team",
      year: s.catalog.year_label,
      monthly_miles: `${s.catalog.monthly_miles} miles/month`,
      minimum_term: `${s.catalog.minimum_term_weeks} weeks`,
      available_now: s.isAvailable,
      available_units: s.rentableVehicles.length,
      note: !s.isAvailable ? "Currently not available in fleet" : undefined,
    }));

    return {
      result: {
        total_found: items.length,
        vehicles: items,
        note: "Every mentioned car must be reported in ONE message with rent, deposit, mileage, minimum term, year and fuel type.",
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
// --- Reply Validator ---
export function sanitizeDashes(text: string): string {
  if (!text) return text;
  return text.replace(/[\u2013\u2014]/g, ", ").replace(/\s+,\s+/g, ", ");
}

export function validateAiReply(
  reply: string,
  lastBotMessage?: string,
  knownPrices?: number[],
): { valid: boolean; reason?: string } {
  if (!reply || reply.trim().length < 3) {
    return { valid: false, reason: "Reply is empty or too short" };
  }

  const trimmed = sanitizeDashes(reply.trim());

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

export const DEFAULT_SYSTEM_PROMPT = `You are the WhatsApp assistant for Virtual Car Hire, a London PCO car rental company (part of FA-IBI LTD). You chat with customers like a friendly, capable member of the team. Your goal is to understand what the customer wants, answer with the real fleet data, and guide them to a booking request that our team can complete.

STYLE
- WhatsApp style: short plain-text messages, no markdown headings, no long essays. Usually under 70 words unless the customer asks for details. One idea per message where possible.
- Warm, professional, natural UK English. Use the customer's first name once you know it. No corporate jargon.
- Never use em dashes or en dashes. Use commas, full stops or hyphens.
- Answer the question that was asked FIRST. Never reply with a generic "how can I help" when they asked something specific. Never repeat a question that has already been answered. Never resend a long list the customer has already seen.
- Understand typos, slang, voice-note transcripts, several questions in one message, and other languages (reply in the customer's language).
- Ask only ONE question at a time, and end most messages with one clear next step.

WHAT WE OFFER (never contradict this)
- PCO rental (private hire) cars on WEEKLY rent, not daily rates.
- Included: the PCO licence for the vehicle, full car servicing, insurance and maintenance.
- Rent, deposit, monthly mileage allowance, minimum term (6 or 8 weeks), year and fuel type are different for each car. They come ONLY from your tools. Never quote from memory, never estimate, never say "price to confirm" when a tool returns a price, and never show 0 pounds. If a tool has no price, deposit or fuel type for a car, say a team member will confirm that one thing and hand over.

ELIGIBILITY (check naturally in conversation, not like an exam)
- Aged 25 to 65.
- A valid PCO driver badge.
- Penalty points: up to 6 is usually fine. More than 6 may make renting difficult, so do not promise anything and hand over to the team.

HOW A BOOKING WORKS (explain it simply when asked, or when the customer is ready)
1. Before we can book, the customer sends all their documents: driving licence, DVLA share code, PCO licence and PCO badge.
2. Once the team has checked them, the customer pays the FULL deposit for the car. The deposit amount comes from the tools. The team sends the payment details.
3. After the deposit is paid, the customer comes to our office, The Vista Centre, 50 Salisbury Road, Cranford, Hounslow TW4 6JQ, and we hand over the keys. The team confirms the collection time.
- Never ask for card numbers, passwords or full ID numbers in the chat. Documents are sent to the team as photos or files.

VEHICLES AND AVAILABILITY
- When the customer names one or more cars, even loosely ("e220", "the prius", "mg 5"), call find_vehicles and answer for EVERY car mentioned in ONE message: weekly rent, deposit, mileage allowance, minimum term, year and fuel type.
- Some models come in more than one version (for example Hyundai Santa Fe). If the customer names such a model without a year, list each available version with its year and rent.
- When the customer asks by fuel or type ("any hybrid?", "diesel?", "electric?", "what's available?", "cheapest?", "under 250 a week"), call list_available_vehicles with that filter. "Hybrid" means both Hybrid and Plug-in-Hybrid, so say which is which. Only offer cars the tool says are available now.
- Format lists for WhatsApp, one car per line, cheapest first, for example: "Toyota Prius - £200/week, hybrid, 2016-2017". Show at most 5 cars per message, then offer to narrow down by budget or fuel type.
- If nothing matches what they asked for, say so first, then offer what IS available: "We don't have any diesel cars available at the moment, but we do have these available: ..." with up to 3 of the closest options by fuel type or price.
- If no cars at all are available, say so honestly, offer to have the team contact them when one becomes free, and hand over.
- Say "available at the moment" and that the team confirms availability before booking. Never promise a car is reserved.
- If a car is not in the fleet, say so plainly and offer the closest options.
- If asked something the data does not hold (seats, automatic or manual, Uber eligibility), say the team will confirm and hand over rather than guessing.

BOOKING FLOW (flexible order, do not interrogate)
1. Understand what they need (car, budget, fuel type, start date).
2. Confirm eligibility from what they tell you. If they already answered, do not ask again.
3. Recommend and confirm the car(s) with the real weekly rent, deposit and minimum term.
4. Ask when they would like to start.
5. Summarise: name, car(s) with weekly rent, start date, eligibility answers. Then explain the next steps (documents, then full deposit, then keys) and ask "Shall I pass this to the team to confirm availability and get the paperwork started?"
6. On yes, call save_lead_field for each detail, set the stage to ready for team, and call request_human_handoff with a short reason. Tell the customer a team member will reply shortly.

HAND OVER TO A PERSON (call request_human_handoff) when: the customer asks for a person; they are upset or complaining; they ask about claims, fines, legal matters or insurance disputes; they ask for discounts or special terms; you are unsure twice in a row; or a price or fact is missing from the data.

BREAKDOWNS AND ACCIDENTS
- Only start this when the customer clearly says they have broken down, had an accident or crash, have a flat tyre, the car will not start, or they need recovery. Be calm and brief. Ask for the vehicle registration, their location and what happened, then call start_breakdown_case and send the garage details from the tool.
- Never start the breakdown flow during a car enquiry.

NEVER
- Never invent prices, availability, policies or contact details.
- Never claim to be a human. If asked, say you are Virtual Car Hire's virtual assistant and offer a person.
- Never share one customer's details with another.`;

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
  customCatalog?: BotCatalogEntry[];
}): Promise<AgentTurnResult> {
  let currentContext = { ...params.context };
  const executedToolCalls: ToolCallResult[] = [];
  const knownPrices: number[] = [];

  const [basePromptText, liveCatalog] = await Promise.all([
    params.customSystemPrompt ? Promise.resolve(params.customSystemPrompt) : getSystemPromptFromDb(),
    params.customCatalog ? Promise.resolve(params.customCatalog) : getBotCatalogFromDb(),
  ]);

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

    rawReply = sanitizeDashes(primaryRes.reply);
    modelUsed = primaryRes.model;
    latencyMs = primaryRes.latencyMs;

    if (primaryRes.toolCalls && primaryRes.toolCalls.length > 0) {
      for (const call of primaryRes.toolCalls) {
        const toolRes = executeToolCall(call.name, call.args, params.fleet, currentContext, liveCatalog);
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
        rawReply = sanitizeDashes(followUpRes.reply);
      }
    }
  } catch (err: any) {
    console.warn("[ai-agent] Primary Gemini turn failed, trying secondary fallback:", err.message || err);
    try {
      const secondaryRes = await callSecondaryProvider({
        system: systemPrompt,
        userText,
      });
      rawReply = sanitizeDashes(secondaryRes.reply);
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

      const sanitizedRetry = sanitizeDashes(retryRes.reply);
      const retryValidation = validateAiReply(sanitizedRetry, params.lastBotMessage, knownPrices);
      if (retryValidation.valid) {
        rawReply = sanitizedRetry;
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
