import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText, sendWhatsAppImageButtons } from "@/lib/meta-whatsapp.server";

const CRM_BASE = "https://servicevch.pages.dev";
const VCH_WEBSITE = "https://virtualcarhire.pages.dev/our-fleet";
const WELCOME_IMAGE_URL = "https://servicevch.pages.dev/whatsapp/virtual-car-hire-welcome.jpg?v=20260826-4";
const AUTO_SURGEON_ADDRESS = "The Auto Surgeon, Unit 3 Squirrels Trading Estate, Viveash Close, Hayes UB3 4RZ";
const AUTO_SURGEON_MAP = "https://www.google.com/maps/search/?api=1&query=The+Auto+Surgeon+Unit+3+Squirrels+Trading+Estate+Viveash+Close+Hayes+UB3+4RZ";
const WELCOME_MENU =
  "👋 Hello, and welcome to Virtual Car Hire\n" +
  "🚘 London's number one PCO car hire company with 4.8 stars across Google and Trustpilot.\n\n" +
  "How can we assist you today? Please tap one of the options below to get started:\n" +
  "🚗 Car enquiry\n" +
  "🛠️ Emergency Breakdown\n" +
  "⚠️ Report Accident";
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
  "Minimum 6-week contract; 5,000 miles per month for all vehicles except Mercedes EQE and EQS, which have 4,000 miles per month; insurance and servicing included.";
const CAR_ELIGIBILITY_PROMPT =
  "Before we look at available vehicles, please confirm three things:\n\n1. Are you aged between 25 and 65 years old?\n2. Do you possess a valid PCO badge?\n3. Do you have any penalty points? If you have fewer than 6 points, renting with us may be difficult.\n\nFor your answer, please reply simply: Yes, Yes, and specify your points. For example: 1. Yes 2. Yes 3. Yes - 3 points.";
const HANDOFF_24H =
  "Our team will get back to you within 24 hours. Please do not contact this number — we will contact you first.";

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
  weekly_price?: number | string | null;
  monthly_mileage_allowance?: number | null;
  minimum_contract_weeks?: number | null;
  insurance_service_included?: boolean | null;
};

type CarEligibility = {
  age?: number | null;
  ageEligible?: boolean;
  pcoBadge?: boolean;
  pcoBadgeUrl?: string;
  pcoBadgeVerification?: BreakdownVerification;
  points?: number | null;
  completed?: boolean;
  selectedVehicle?: {
    make: string;
    model: string;
    year: number | string | null;
    weeklyRate: string;
    mileage: number;
    contractWeeks: number;
  };
};

type AiResult = {
  reply: string;
  needs_human: boolean;
  reason: string;
  asks_closure: boolean;
};

type BreakdownVerification = {
  status: "verified" | "unclear" | "rejected" | "received_pending_review" | "error";
  confidence?: number;
  reason: string;
  checkedAt: string;
};

type BreakdownData = {
  garageInstructionsSent?: boolean;
  recoveryGuidanceSent?: boolean;
  keyPhotoUrl?: string;
  keyVideoUrl?: string;
  keyPhotoVerification?: BreakdownVerification;
  keyVideoVerification?: BreakdownVerification;
  keyMediaChecked?: boolean;
  closed?: boolean;
};

type AccidentData = {
  driverName?: string;
  driverReg?: string;
  verified?: boolean;
  vehicleId?: string | null;
  atFaultDriverName?: string;
  atFaultDriverLicenseUrl?: string;
  atFaultVehicleReg?: string;
  incidentDate?: string;
  incidentTime?: string;
  location?: string;
  description?: string;
  evidenceUrls?: string[];
};

const bodySchema = z.object({
  phone: z.string().trim().min(3).max(40).optional(),
  chat_id: z.string().trim().min(3).max(160).optional(),
    name: z.string().trim().max(120).optional(),
  content: z.string().trim().min(1).max(5000),
  media_url: z.string().trim().url().max(2000).optional(),
  media_meta_id: z.string().trim().max(300).optional(),
  media_type: z.string().trim().max(40).optional(),
  media_mime_type: z.string().trim().max(160).optional(),
  meta_message_id: z.string().trim().max(300).optional(),
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
  for (const column of ["session_id", "handoff", "meta_message_id", "media_type", "media_mime_type", "media_meta_id"]) {
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
  const normalized = text.trim().replace(/^[\s,!.:;-]+|[\s,!.:;-]+$/g, "");
  return /^(?:menu|main menu|restart|start again|start over|reset|hello|hi|hey|hiya|howdy|greetings|welcome|good morning|good afternoon|good evening|good day|morning|afternoon|evening)(?:[\s,!.:;-].*)?$/i.test(normalized)
    || /\b(?:hello|hi|hey|hiya|howdy|greetings|welcome|good morning|good afternoon|good evening|good day)\b/i.test(normalized);
}

function isCarRequest(text: string): boolean {
  return /\b(?:car|cars|vehicle|vehicles|available|availability|fleet|hire|rent|rental|mercedes|toyota|tesla|eqe|corolla|auris|prius|e300|e220|vito|eqs|ioniq|jaguar|mg5|tourneo|multivan)\b/i.test(text);
}

function isAccidentRequest(text: string): boolean {
  return /\b(?:accident|crash|collision|bumped|damage|damaged|smash|hit|incident)\b/i.test(text);
}

function normalizeReg(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function canonicalPhoneKey(value: string | null | undefined): string | null {
  if (!value || /@lid$/i.test(value)) return null;
  let digits = value.replace(/@(?:c|s\.whatsapp\.net)$/i, "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = `44${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}

function extractReg(value: string): string | null {
  const match = value.toUpperCase().match(/\b[A-Z]{1,3}\s*\d{1,4}\s*[A-Z]{1,3}\b|\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b/);
  return match ? normalizeReg(match[0]) : null;
}

function extractDate(value: string): string | null {
  const iso = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const uk = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  return uk ? `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}` : null;
}

function extractTime(value: string): string | null {
  const match = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\s*(am|pm)?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  if (match[3]?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (match[3]?.toLowerCase() === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${match[2]}:00`;
}

function labeledValue(text: string, labels: string[]): string | null {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:${escaped})\\s*[:=-]\\s*(.+)`, "i"));
  return match?.[1]?.trim() || null;
}

function normalizeDriverName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function accidentMissing(data: AccidentData): string[] {
  const missing: string[] = [];
  if (!data.atFaultDriverName) missing.push("the other driver’s full name");
  if (!data.atFaultDriverLicenseUrl) missing.push("a clear photo of their driving licence");
  if (!data.atFaultVehicleReg) missing.push("their vehicle registration");
  if (!data.incidentDate) missing.push("the date of the accident");
  if (!data.incidentTime) missing.push("the time of the accident");
  if (!data.location) missing.push("the place of the accident");
  if (!data.description) missing.push("a short description of what happened");
  if (!data.evidenceUrls?.length) missing.push("all accident photos and videos");
  return missing;
}

function formatAccidentSummary(data: AccidentData): string {
  return [
    "🚨 Accident report summary",
    "",
    `Your driver: ${data.driverName ?? "Not supplied"}`,
    `Your vehicle registration: ${data.driverReg ?? "Not supplied"}`,
    "",
    `Other driver: ${data.atFaultDriverName ?? "Not supplied"}`,
    `Other vehicle registration: ${data.atFaultVehicleReg ?? "Not supplied"}`,
    `Licence image: ${data.atFaultDriverLicenseUrl ? "Received" : "Missing"}`,
    `Accident date: ${data.incidentDate ?? "Not supplied"}`,
    `Accident time: ${data.incidentTime ?? "Not supplied"}`,
    `Location: ${data.location ?? "Not supplied"}`,
    `Description: ${data.description ?? "Not supplied"}`,
    `Photos/videos: ${data.evidenceUrls?.length ? `${data.evidenceUrls.length} file(s) received` : "Missing"}`,
    "",
    "Is this information correct? Please reply Yes or No.",
  ].join("\\n");
}

function isLikelyFullName(text: string): boolean {
  const value = text.trim();
  return value.length >= 3 && value.length <= 90 && !isCarRequest(value) && /^[A-Za-z][A-Za-z .'-]+$/.test(value);
}

function parseMenuOption(text: string): 1 | 2 | 3 | null {
  const normalized = text.trim().toLowerCase().replace(/[.!]+$/g, "");
  if (/^(?:option\s*)?\[?1\]?$/.test(normalized) || /^(?:car enquiry|enquire about a car|book a car)$/.test(normalized)) return 1;
  if (/^(?:option\s*)?\[?2\]?$/.test(normalized) || /^(?:emergency breakdown|breakdown|emergency)$/.test(normalized)) return 2;
  if (/^(?:option\s*)?\[?3\]?$/.test(normalized) || /^(?:report accident|accident)$/.test(normalized)) return 3;
  return null;
}

function isBreakdownRequest(text: string): boolean {
  return /\b(?:breakdown|broken down|broke down|vehicle won't start|car won't start|stranded|recovery)\b/i.test(text);
}

function isTermsResponse(text: string): boolean {
  return /^(?:yes|no|yeah|nope|yep|not yet|i(?:'m| am) not sure)[.!\s]*$/i.test(text.trim());
}

function parseCarEligibility(text: string): CarEligibility {
  const lower = text.toLowerCase().replace(/[’]/g, "'");
  const result: CarEligibility = {};

  // Customers often answer the three numbered questions compactly, for
  // example: "1.Yes 2.Yes 3.Yes-3". Treat those as answers to the
  // eligibility questions rather than sending the message to the generic AI.
  const numberedAge = lower.match(/(?:^|[\s,])1\s*[.)-]?\s*(yes|yeah|yep|no|nope)\b/i);
  if (numberedAge) result.ageEligible = /^(?:yes|yeah|yep)$/i.test(numberedAge[1]);
  const numberedBadge = lower.match(/(?:^|[\s,])2\s*[.)-]?\s*(yes|yeah|yep|no|nope)\b/i);
  if (numberedBadge) result.pcoBadge = /^(?:yes|yeah|yep)$/i.test(numberedBadge[1]);
  const numberedPoints = lower.match(/(?:^|[\s,])3\s*[.)-]?\s*(?:yes|yeah|yep|no|nope)?\s*[-:=]?\s*(\d{1,2})\b/i);
  if (numberedPoints) result.points = Number(numberedPoints[1]);

  // Accept natural answers such as “I am 40”, “40 years old”, “age: 40”,
  // or the compact “40, full UK, 0 points”.
  const labelledAge = lower.match(/(?:\b(?:age|aged)\b|\b(?:i\s*am|i'm|im)\b)\s*(?:is|:)?\s*(\d{2})/i);
  const anyAge = lower.match(/\b(\d{2})\s*(?:years?\s*old)?\b/);
  const age = Number(labelledAge?.[1] ?? anyAge?.[1]);
  if (Number.isFinite(age) && age >= 18 && age <= 99) {
    result.age = age;
    result.ageEligible = age >= 25 && age <= 65;
  }

  const badgeNegative = /\b(?:no|not|don't|do not|never|can't|cannot|without)\b[^.\n]{0,35}\b(?:have|hold|possess|get|pc[o0])\b[^.\n]{0,20}\b(?:pc[o0]\s*)?(?:badge|licen[cs]e|card|permit)\b|\bno\s+(?:valid\s+)?pc[o0]\s+badge\b/i.test(lower);
  const badgeMentioned = /\b(?:valid\s+)?pc[o0]\s+(?:badge|licen[cs]e|card|permit)\b|\bpc[o0]\s+approved\b|\bpc[o0]\b/i.test(lower);
  const positiveBadge = /\b(?:valid|current|active|approved|full)\b[^.\n]{0,25}\b(?:pc[o0]|badge|permit|card)\b|\b(?:yes|yeah|yep|i\s+(?:do|have|hold|possess))\b[^.\n]{0,20}\b(?:it|one|badge|pc[o0])\b/i.test(lower);
  if (badgeNegative) result.pcoBadge = false;
  else if ((badgeMentioned && !badgeNegative) || positiveBadge || (/\b(?:yes|yeah|yep)\b/i.test(lower) && !badgeNegative)) result.pcoBadge = true;

  if (/\b(?:no|zero|none)\s+(?:penalty\s+)?points?\b/i.test(lower)) {
    result.points = 0;
  } else {
    const pointsMatch = lower.match(/(?:points?|penalty\s+points?)\s*(?:are|is|:|=)?\s*(\d{1,2})|\b(\d{1,2})\s*(?:penalty\s+)?points?\b/i);
    if (pointsMatch) result.points = Number(pointsMatch[1] ?? pointsMatch[2]);
  }

  result.completed = result.ageEligible !== undefined && result.pcoBadge !== undefined && result.points !== undefined;
  return result;
}

function eligibilityMissing(data: CarEligibility): string[] {
  const missing: string[] = [];
  if (data.ageEligible !== true && (data.age === undefined || data.age === null)) missing.push("whether your age is between 25 and 65");
  else if (!data.ageEligible) missing.push("confirmation that your age is between 25 and 65");
  if (data.pcoBadge === undefined) missing.push("whether you have a valid PCO badge");
  else if (!data.pcoBadge) missing.push("a valid PCO badge");

  if (data.points === undefined || data.points === null) missing.push("the number of penalty points you have");
  return missing;
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
  if (!available.length) return `I’m sorry, there are no vehicles currently marked available.\n\n${HANDOFF_24H}`;
  const lines = available.map((vehicle, index) => {
    const catalog = websiteMatch(vehicle);
    const price = vehicle.weekly_price != null ? `£${vehicle.weekly_price}/week` : catalog?.price ?? "Price to confirm";
    const year = vehicle.year ?? catalog?.year ?? "Year to confirm";
    return `${index + 1}. ${vehicle.make} ${vehicle.model} (${year}) — ${catalog?.fuel ?? fuelCategory(vehicle.fuel_type)} — ${price} — ${mileageAllowance(vehicle).toLocaleString("en-GB")} miles/month — ${contractWeeks(vehicle)} weeks`;
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

function mileageAllowance(vehicle: FleetVehicle): number {
  const model = `${vehicle.make} ${vehicle.model}`.toLowerCase();
  if (model.includes("eqe") || model.includes("eqs")) return 4000;
  return Number(vehicle.monthly_mileage_allowance) || 5000;
}

function contractWeeks(vehicle: FleetVehicle): number {
  return Number(vehicle.minimum_contract_weeks) || 6;
}

function formatCarHandoffSummary(data: CarEligibility, answer: string): string {
  const selected = data.selectedVehicle;
  return selected
    ? `Customer wants: ${selected.make} ${selected.model} (${selected.year ?? "year to confirm"}) — ${selected.weeklyRate}; ${selected.mileage.toLocaleString("en-GB")} miles/month; ${selected.contractWeeks}-week minimum. Terms answer: ${answer}.`
    : `Customer wants a vehicle. Terms answer: ${answer}.`;
}

function formatVehicleDetails(vehicle: FleetVehicle): string {
  const catalog = websiteMatch(vehicle);
  const price = vehicle.weekly_price != null ? `£${vehicle.weekly_price}/week` : catalog?.price ?? "Price to confirm";
  const year = vehicle.year ?? catalog?.year ?? "Year to confirm";
  return `Thank you for choosing the ${vehicle.make} ${vehicle.model}.\n\nVehicle: ${vehicle.make} ${vehicle.model}\nYear: ${year}\nFuel category: ${catalog?.fuel ?? fuelCategory(vehicle.fuel_type)}\nContract length: Minimum ${contractWeeks(vehicle)} weeks\nMileage allowance: ${mileageAllowance(vehicle).toLocaleString("en-GB")} miles per month\nWeekly rate: ${price}\nIncluded: Insurance, servicing and maintenance\n\nAre you fully aware of and happy with these contract length and mileage details? Please reply Yes or No.`;
}

function formatFleet(fleet: FleetVehicle[]): string {
  const available = fleet.filter(isAvailable);
  const grouped = ["Electric", "Plug-in-Hybrid", "Petrol"].map((category) => {
    const cars = available
      .filter((vehicle) => fuelCategory(vehicle.fuel_type) === category)
      .map((vehicle) => {
        const catalog = websiteMatch(vehicle);
        const year = vehicle.year ?? catalog?.year ?? "year to confirm";
        const price = vehicle.weekly_price != null ? `£${vehicle.weekly_price}/week` : catalog?.price ?? "price to confirm";
        return `${vehicle.make} ${vehicle.model} (${year}; ${price}; ${mileageAllowance(vehicle).toLocaleString("en-GB")} miles/month; ${contractWeeks(vehicle)} weeks)`;
      })
      .join(", ");
    return `${category}: ${cars || "none currently available"}`;
  });
  return `Available vehicles (${available.length}/${fleet.length}; rented, in-service and off-road vehicles excluded):\n${grouped.join("\n")}`;
}

async function sendWelcomeMenu(phone: unknown) {
  const body =
    "👋 Hello, and welcome to Virtual Car Hire\n" +
    "🚘 London's number one PCO car hire company with 4.8 stars across Google and Trustpilot.\n\n" +
    "How can we assist you today? Please tap one of the options below to get started:";
  const buttons = [
    { id: "book_car", title: "Car enquiry" },
    { id: "emergency_breakdown", title: "Emergency Breakdown" },
    { id: "report_accident", title: "Report Accident" },
  ];
  const interactive = await sendWhatsAppImageButtons({ phone, imageUrl: WELCOME_IMAGE_URL, body, buttons });
  if (interactive.sent) return interactive;
  console.warn("[agent-webhook] welcome interactive image failed; falling back to text menu", { reason: interactive.reason });
  const fallback = await sendWhatsAppText({ phone, text: WELCOME_MENU });
  if (fallback.sent) return fallback;
  console.error("[agent-webhook] welcome delivery failed", { interactive: interactive.reason, fallback: fallback.reason });
  return { sent: false, reason: `welcome_delivery_failed: interactive=${interactive.reason}; fallback=${fallback.reason}` };
}

async function generateReply(
  history: Turn[],
  latest: string,
  hasMedia: boolean,
  fleet: FleetVehicle[],
): Promise<AiResult> {
  const fallbackReply = isBreakdownRequest(latest)
    ? `I’m here to help. If the vehicle is unsafe, move to a safe place and call 999 if anyone is injured or in immediate danger. For recovery, please use your own provider and take the vehicle to ${AUTO_SURGEON_ADDRESS}. Send your registration and location so I can guide you through the next step.`
    : isAccidentRequest(latest)
      ? "I’m here to help with the accident report. Please send your full name, the vehicle registration, the accident location, and whether anyone is injured. You can send photos and videos separately."
      : isCarRequest(latest)
        ? formatCustomerFleet(fleet)
        : "I’m here to help. Please tell me what has happened, your vehicle registration, and your current location if this is urgent.";
  const fallback: AiResult = {
    reply: fallbackReply,
    needs_human: false,
    reason: "ai_fallback_used",
    asks_closure: false,
  };
  const system =
    "You are the WhatsApp assistant for Virtual Car Hire (VCH), a UK PCO/private-hire car rental company. " +
    "Reply naturally in UK English. Keep normal replies short: one to four brief lines and normally under 450 characters. Do not repeat the welcome menu or previous answer. Use concise bullet-style lines only when listing cars or contract details. Use £ for prices. " +
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
    type GeminiGeneration = { response: Response; body: string; model: string; apiVersion: string };
    const callModel = async (apiVersion: string, model: string): Promise<GeminiGeneration> => {
      const response = await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });
      return { response, body: await response.text(), model, apiVersion };
    };
    // Use one stable low-latency model request. Do not turn a model 404 into a
    // customer handoff; the deterministic fallback above keeps the workflow moving.
    const model = (getRuntimeEnv("GEMINI_MODEL") ?? "gemini-2.0-flash-001").trim();
    const generation = await callModel("v1beta", model);
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

async function verifyImageEvidence(mediaUrl: string, mimeType = "image/jpeg", evidencePrompt = "Inspect this breakdown key photo. Return JSON only with status exactly verified, unclear, or rejected; confidence from 0 to 1; and a short reason. Mark verified only when a vehicle key is clearly visible inside or immediately at a letter box. Do not identify or infer any person. If the key, letter box, or placement is not clear, use unclear."): Promise<BreakdownVerification> {
  const checkedAt = new Date().toISOString();
  const apiKey = (getRuntimeEnv("GEMINI_API_KEY") ?? getRuntimeEnv("GOOGLE_API_KEY") ?? "").trim();
  if (!apiKey) return { status: "error", reason: "Photo received but vision verification is not configured.", checkedAt };
  try {
    const mediaResponse = await fetch(mediaUrl);
    if (!mediaResponse.ok) throw new Error(`media_http_${mediaResponse.status}`);
    const contentType = mediaResponse.headers.get("content-type")?.split(";")[0] || mimeType;
    if (!contentType.startsWith("image/")) return { status: "unclear", reason: "The uploaded file is not an image. Please send a clear photo of the key in the letter box.", checkedAt };
    const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
    if (bytes.byteLength > 8 * 1024 * 1024) return { status: "unclear", reason: "The photo is too large to verify reliably. Please send a smaller clear photo.", checkedAt };
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    const encoded = btoa(binary);
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { text: evidencePrompt },
          { inline_data: { mime_type: contentType, data: encoded } },
        ] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
    const responseText = await response.text();
    if (!response.ok) throw new Error(`vision_http_${response.status}`);
    const payload = JSON.parse(responseText) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
    const parsed = JSON.parse(raw) as { status?: string; confidence?: number; reason?: string };
    const status = parsed.status === "verified" || parsed.status === "rejected" ? parsed.status : "unclear";
    return { status, confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)), reason: parsed.reason?.slice(0, 300) || "The photo could not be verified clearly.", checkedAt };
  } catch (error) {
    console.error("[agent-webhook] breakdown photo verification failed", { error: error instanceof Error ? error.message : String(error) });
    return { status: "error", reason: "Photo received but verification is temporarily unavailable. Please send a clear photo showing the key in the letter box.", checkedAt };
  }
}

async function persistMetaMedia(params: {
  db: { from: (table: string) => any; storage: any };
  leadId: string;
  messageId: string | null;
  userId: string;
  metaMediaId?: string;
  mediaType?: string;
  mimeType?: string;
  caption?: string;
}) {
  if (!params.metaMediaId) return { mediaUrl: params.caption ? null : null, storagePath: null };
  const accessToken = getRuntimeEnv("META_ACCESS_TOKEN")?.trim();
  if (!accessToken) throw new Error("META_ACCESS_TOKEN is not configured for media download");
  const mediaInfoResponse = await fetch(`https://graph.facebook.com/v26.0/${encodeURIComponent(params.metaMediaId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const mediaInfoText = await mediaInfoResponse.text();
  if (!mediaInfoResponse.ok) throw new Error(`Meta media metadata failed (${mediaInfoResponse.status}): ${mediaInfoText.slice(0, 300)}`);
  const mediaInfo = JSON.parse(mediaInfoText) as { url?: string; mime_type?: string };
  if (!mediaInfo.url) throw new Error("Meta media metadata did not include a download URL");
  const mediaResponse = await fetch(mediaInfo.url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!mediaResponse.ok) throw new Error(`Meta media download failed (${mediaResponse.status})`);
  const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
  const extension = (mediaInfo.mime_type ?? params.mimeType ?? "application/octet-stream").split("/")[1]?.split(";")[0] ?? "bin";
  const storagePath = `${params.userId}/${params.leadId}/${params.metaMediaId}.${extension}`;
  const bucket = params.db.storage.from("whatsapp-media");
  const upload = await bucket.upload(storagePath, bytes, { contentType: mediaInfo.mime_type ?? params.mimeType ?? "application/octet-stream", upsert: false });
  if (upload.error && !/already exists/i.test(upload.error.message)) throw upload.error;
  const signed = await bucket.createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (signed.error) throw signed.error;
  const { error: mediaRowError } = await params.db.from("whatsapp_media").upsert({
    user_id: params.userId,
    lead_id: params.leadId,
    message_id: null,
    meta_media_id: params.metaMediaId,
    media_type: params.mediaType ?? "media",
    mime_type: mediaInfo.mime_type ?? params.mimeType ?? null,
    storage_bucket: "whatsapp-media",
    storage_path: storagePath,
    caption: params.caption ?? null,
  }, { onConflict: "meta_media_id" });
  if (mediaRowError) throw mediaRowError;
  return { mediaUrl: signed.data?.signedUrl ?? null, storagePath };
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
  const text =
    `${params.closed ? "✅ <b>Conversation ended</b>" : "🚨 <b>Handoff needed</b>"}\n` +
    `<b>Name:</b> ${escapeHtml(params.name)}\n` +
    (params.phone ? `<b>Phone:</b> ${escapeHtml(params.phone)}\n` : "") +
    `<b>Reason:</b> ${escapeHtml(params.reason)}\n` +
    `<a href="${CRM_BASE}/whatsapp-leads?lead=${encodeURIComponent(params.leadId)}">Open CRM</a>`;
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
  const {
    content,
    media_url: incomingMediaUrl = null,
    media_meta_id: mediaMetaId = null,
    media_type: mediaType = null,
    media_mime_type: mediaMimeType = null,
    meta_message_id: metaMessageId = null,
    session_id: suppliedSessionId = null,
  } = parsed.data;
  let mediaUrl = incomingMediaUrl;
  const chatId = parsed.data.chat_id ?? null;
  const phone = parsed.data.phone ?? null;
  // WhatsApp may omit `phone` on some events while still providing chat_id.
  // Use the chat identifier for identity lookup, but keep it hidden from display.
  const identityPhone = phone ?? chatId;
  const sessionId = chatId ? `meta:${chatId}` : suppliedSessionId;
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
  let customerType = "new_customer";
  let accidentData: AccidentData = {};
  let breakdownData: BreakdownData = {};
  let carEligibility: CarEligibility = {};
  const canonicalPhone = identityPhone && !/@lid$/i.test(identityPhone) ? identityPhone : null;
  if (canonicalPhone) {
    const { data: existing } = await (db.from("whatsapp_leads") as any)
      .select("id, contact_name, ai_paused, status, closed_at, intent, accident_data, breakdown_data, car_enquiry_data, customer_type")
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
    customerType = existing?.customer_type ?? customerType;
    accidentData = (existing?.accident_data ?? {}) as AccidentData;
    breakdownData = (existing?.breakdown_data ?? {}) as BreakdownData;
    carEligibility = (existing?.car_enquiry_data ?? {}) as CarEligibility;
  }
  if (!leadId && canonicalPhone) {
    const { data: candidates } = await (db.from("whatsapp_leads") as any)
      .select("id, contact_name, phone, ai_paused, status, closed_at, intent, accident_data, breakdown_data, car_enquiry_data, customer_type")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(500);
    const matchingCandidates = (candidates ?? [])
      .filter((candidate: { phone?: string | null }) => canonicalPhoneKey(candidate.phone) === canonicalPhoneKey(canonicalPhone))
      .sort((a: { intent?: string | null; status?: string | null; last_message_at?: string | null }, b: { intent?: string | null; status?: string | null; last_message_at?: string | null }) => {
        const intentScore = Number(Boolean(b.intent)) - Number(Boolean(a.intent));
        if (intentScore) return intentScore;
        const activeScore = Number(b.status !== "closed") - Number(a.status !== "closed");
        if (activeScore) return activeScore;
        return String(b.last_message_at ?? "").localeCompare(String(a.last_message_at ?? ""));
      });
    const existing = matchingCandidates[0];
    if (existing) {
      leadId = existing.id;
      aiPaused = Boolean(existing.ai_paused);
      closed = Boolean(existing.closed_at) || existing.status === "closed";
      leadName = existing.contact_name && existing.contact_name !== "Unknown" ? existing.contact_name : leadName;
      leadIntent = existing.intent ?? null;
      customerType = existing.customer_type ?? customerType;
      accidentData = (existing.accident_data ?? {}) as AccidentData;
      breakdownData = (existing.breakdown_data ?? {}) as BreakdownData;
      carEligibility = (existing.car_enquiry_data ?? {}) as CarEligibility;
    }
  }
  if (!leadId && sessionId) {
    const { data: existing } = await (db.from("whatsapp_leads") as any)
      .select("id, contact_name, ai_paused, status, closed_at, intent, accident_data, breakdown_data, car_enquiry_data, customer_type")
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
    customerType = existing?.customer_type ?? customerType;
    accidentData = (existing?.accident_data ?? {}) as AccidentData;
    breakdownData = (existing?.breakdown_data ?? {}) as BreakdownData;
    carEligibility = (existing?.car_enquiry_data ?? {}) as CarEligibility;
  } else if (!leadId && phone) {
    const { data: existing } = await (db.from("whatsapp_leads") as any)
      .select("id, contact_name, ai_paused, status, closed_at, intent, accident_data, breakdown_data, car_enquiry_data, customer_type")
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
    customerType = existing?.customer_type ?? customerType;
    accidentData = (existing?.accident_data ?? {}) as AccidentData;
    breakdownData = (existing?.breakdown_data ?? {}) as BreakdownData;
    carEligibility = (existing?.car_enquiry_data ?? {}) as CarEligibility;
  }

  if (!leadId) {
    isNewLead = true;
    const { data: created, error } = await insertWithSessionFallback(db, "whatsapp_leads", {
      user_id: userId,
        contact_name: name,
        phone: canonicalPhone ?? phone,
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
        ...(phone && !/@lid$/i.test(phone) ? { phone } : {}),
        // Do not overwrite the canonical session key when Meta identifiers vary
        // between a linked ID and a resolved @c.us chat identifier.
        last_message_at: new Date().toISOString(),
        inactivity_prompted_at: null,
        inactivity_alerted_at: null,
        message: content,
        ...(mediaUrl ? { media_url: mediaUrl } : {}),
      } as never)
      .eq("id", leadId);
  }

  if (!leadId) return json({ ok: false, error: "Lead could not be created" }, 500);

  if (metaMessageId) {
    const { data: duplicateMessage } = await (db.from("messages") as any).select("id").eq("meta_message_id", metaMessageId).maybeSingle();
    if (duplicateMessage) return json({ ok: true, duplicate: true, lead_id: leadId });
  }

  if (mediaMetaId) {
    try {
      const stored = await persistMetaMedia({ db, leadId, messageId: metaMessageId, userId, metaMediaId: mediaMetaId, mediaType: mediaType ?? undefined, mimeType: mediaMimeType ?? undefined, caption: content });
      mediaUrl = stored.mediaUrl ?? mediaUrl;
    } catch (error) {
      console.error("[agent-webhook] Meta media persistence failed", { leadId, metaMediaId: mediaMetaId, error: error instanceof Error ? error.message : String(error) });
    }
  }

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
    meta_message_id: metaMessageId,
    media_type: mediaType,
    media_mime_type: mediaMimeType,
    media_meta_id: mediaMetaId,
    session_id: sessionId,
  });
  if (inboundError) return json({ ok: false, error: inboundError.message }, 500);
  const history = [...((oldHistory ?? []) as Turn[]), inbound];
  const lastAgentMessage = [...history].reverse().find((turn) => turn.sender === "ai_agent")?.content ?? "";
  const { data: fleet } = await db
    .from("vehicles")
    .select("reg, make, model, year, fuel_type, status, next_mot_date, pco_expiry_date");

  const rawOption = parseMenuOption(content) ?? (/^(?:book_car|enquire_about_a_car|enquire|emergency_breakdown|breakdown|report_accident|accident)$/i.test(content.trim()) ? (/(?:emergency|breakdown)/i.test(content) ? 2 : /(?:accident|report)/i.test(content) ? 3 : 1) : null);

  if ((isNewLead || closed) && !isMenuReset(content) && !rawOption) {
    const reply = WELCOME_MENU;
    const outbound = await sendWelcomeMenu(phone ?? chatId);
    if (outbound.sent) {
      await db.from("whatsapp_leads").update({ status: "active", ai_paused: false, closed_at: null, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    }
    const telegram_alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history, mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, welcome_menu: outbound.sent, needs_human: !outbound.sent, telegram_alert, outbound });
  }

  if (isMenuReset(content)) {
    const reply = WELCOME_MENU;
    const outbound = await sendWelcomeMenu(phone ?? chatId);
    if (outbound.sent) {
      await db.from("whatsapp_leads").update({ status: "active", ai_paused: false, closed_at: null, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    }
    const telegram_alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history, mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, welcome_menu: outbound.sent, needs_human: !outbound.sent, telegram_alert, outbound });
  }

  if (isAbusiveMessage(content)) {
    const reply = `Handoff needed.\n\n${HANDOFF_24H}`;
    await insertWithSessionFallback(db, "messages", {
      user_id: userId,
      lead_id: leadId,
      sender: "ai_agent",
      content: reply,
      handoff: true,
      session_id: sessionId,
    });
    await db.from("whatsapp_leads").update({ status: "needs_human", ai_paused: true, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
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

  // A fresh menu tap is an explicit new session. Reopen the lead and let the
  // option branch send the next prompt instead of silently returning closed.
  if (closed && !rawOption) {
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
    (!leadIntent && isBreakdownRequest(content) ? 2 : !leadIntent && isAccidentRequest(content) ? 3 : !leadIntent && isCarRequest(content) ? 1 : null);

  const carEligibilityActive =
    leadIntent === "book_car" ||
    (!carEligibility.completed && Object.keys(carEligibility).length > 0) ||
    /are you aged between 25 and 65|valid pco badge|pc[o0] badge|penalty points/i.test(lastAgentMessage);
  if (!option && carEligibilityActive) {
    const incomingEligibility = parseCarEligibility(content);
    const nextEligibility: CarEligibility = { ...carEligibility, ...incomingEligibility };
    const missing = eligibilityMissing(nextEligibility);
    if (missing.length || !nextEligibility.completed) {
        const reply = !nextEligibility.ageEligible && nextEligibility.age !== undefined
        ? `Thank you. Our standard rental age range is 25 to 65, so we may not be able to proceed with this enquiry.\n\n${HANDOFF_24H}`
        : `Thanks. I still need ${missing.join(", ")}. Please reply naturally—for example: I’m 30, I have a valid PCO badge, and I have 3 points.`;
      const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
      if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
      await db.from("whatsapp_leads").update({ car_enquiry_data: nextEligibility, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, eligibility: nextEligibility, needs_human: !outbound.sent });
    }
    const reply = formatCustomerFleet((fleet ?? []) as FleetVehicle[]);
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    await db.from("whatsapp_leads").update({ car_enquiry_data: nextEligibility, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, eligibility: nextEligibility, needs_human: !outbound.sent });
  }

  if (!option && leadIntent === "book_car" && lastAgentMessage.toLowerCase().includes("full name") && isLikelyFullName(content)) {
    const customerName = content.trim();
    const reply = formatCustomerFleet((fleet ?? []) as FleetVehicle[]);
    await db.from("whatsapp_leads").update({ contact_name: customerName, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    return json({ ok: true, lead_id: leadId, reply, outbound, needs_human: !outbound.sent });
  }

  if (!option && leadIntent === "book_car" && findSelectedVehicle(content, (fleet ?? []) as FleetVehicle[]) && /(which vehicle|which car|available|fleet|vehicles currently marked)/i.test(lastAgentMessage)) {
    const selected = findSelectedVehicle(content, (fleet ?? []) as FleetVehicle[]);
    if (selected) {
      const reply = formatVehicleDetails(selected);
      const selectedVehicle = {
        make: selected.make,
        model: selected.model,
        year: selected.year ?? websiteMatch(selected)?.year ?? null,
        weeklyRate: selected.weekly_price != null ? `£${selected.weekly_price}/week` : websiteMatch(selected)?.price ?? "Price to confirm",
        mileage: mileageAllowance(selected),
        contractWeeks: contractWeeks(selected),
      };
      const nextEligibility: CarEligibility = { ...carEligibility, selectedVehicle };
      const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
      if (outbound.sent) {
        await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
        await db.from("whatsapp_leads").update({ car_enquiry_data: nextEligibility, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      }
      const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
      return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, needs_human: !outbound.sent, telegram_alert: alert });
    }
  }

  if (!option && leadIntent === "report_accident" && /full name|provide your full name/i.test(lastAgentMessage) && isLikelyFullName(content)) {
    const customerName = content.trim();
    const reply = "Accident Support\n\nThank you, " + customerName + ". Please now send the vehicle registration, incident date, location, a short description of what happened, and any photos.";
    await db.from("whatsapp_leads").update({ contact_name: customerName, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    return json({ ok: true, lead_id: leadId, reply, outbound, needs_human: !outbound.sent });
  }

  if (option === 1 || option === 2 || option === 3) {
    const reply = option === 1
      ? `Car Enquiry\n\n${CAR_ELIGIBILITY_PROMPT}`
      : option === 2
        ? `🛠️ Emergency Breakdown\n\nPlease arrange for the vehicle to be dropped off at our garage:\n\n${AUTO_SURGEON_ADDRESS}\n\n📍 Clickable map: ${AUTO_SURGEON_MAP}\n\nOnce the address has been sent, contact your own breakdown recovery provider, such as a local recovery company or RAC. Virtual Car Hire does not provide the recovery vehicle.\n\nPlease park the vehicle in front of The Auto Surgeon, leave the key in the letter box, and send us one clear photo and one video of the key in the letter box. I will check that both have been received before we close the case.`
        : "🚨 Accident Support\n\nWe are sorry to hear you have been in an accident. We are here to help guide you through the next steps safely.\n\nTo get started, please provide your full name:";
    const intent = option === 1 ? "book_car" : option === 2 ? "emergency_breakdown" : "report_accident";
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    if (outbound.sent) {
      await insertWithSessionFallback(db, "messages", {
        user_id: userId,
        lead_id: leadId,
        sender: "ai_agent",
        content: reply,
        session_id: sessionId,
      });
      await db.from("whatsapp_leads").update({ intent, ai_summary: reply, ai_paused: false, closed_at: null, car_enquiry_data: option === 1 ? {} : carEligibility, breakdown_data: option === 2 ? { ...breakdownData, garageInstructionsSent: true } : breakdownData, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    }
    let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
    if (!outbound.sent) {
      alert = await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    }
    return json({ ok: true, lead_id: leadId, reply, needs_human: !outbound.sent, ai_paused: !outbound.sent, telegram_alert: alert, outbound });
  }

  if (!option && leadIntent === "emergency_breakdown") {
    const next: BreakdownData = { ...breakdownData };
    const normalizedMediaType = (mediaType ?? "").toLowerCase();
    let photoVerification = next.keyPhotoVerification;
    if (mediaUrl && normalizedMediaType === "image") {
      photoVerification = await verifyImageEvidence(mediaUrl, mediaMimeType ?? "image/jpeg");
      next.keyPhotoUrl = next.keyPhotoUrl ?? mediaUrl;
      next.keyPhotoVerification = photoVerification;
    }
    if (mediaUrl && normalizedMediaType === "video") {
      next.keyVideoUrl = next.keyVideoUrl ?? mediaUrl;
      next.keyVideoVerification = next.keyVideoVerification ?? {
        status: "received_pending_review",
        reason: "Video received and retained for review.",
        checkedAt: new Date().toISOString(),
      };
    }
    const photoVerified = next.keyPhotoVerification?.status === "verified";
    const mediaComplete = Boolean(next.keyPhotoUrl && next.keyVideoUrl && photoVerified);
    if (mediaComplete && next.keyMediaChecked && isPositiveClosure(content) && lastAgentMessage.toLowerCase().includes("is that all for today")) {
      const summary = `Emergency breakdown case\n\nGarage: ${AUTO_SURGEON_ADDRESS}\nMap: ${AUTO_SURGEON_MAP}\nKey photo: Received\nKey video: Received`;
      const { error: caseError } = await db.from("accident_cases").insert({
        user_id: userId,
        source_lead_id: leadId,
        customer_phone: phone,
        case_type: "breakdown",
        garage_name: "The Auto Surgeon",
        garage_address: AUTO_SURGEON_ADDRESS,
        garage_map_url: AUTO_SURGEON_MAP,
        key_photo_url: next.keyPhotoUrl,
        key_video_url: next.keyVideoUrl,
        evidence_urls: [next.keyPhotoUrl, next.keyVideoUrl],
        ai_summary: summary,
        severity: "minor",
        status: "open",
      } as never);
      if (caseError) console.error("[agent-webhook] breakdown case insert failed", { leadId, error: caseError.message });
      const reply = "✅ Thank you. The breakdown case and key media have been saved for our team. This conversation is now closed.";
      const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
      if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, handoff: true, session_id: sessionId });
      await db.from("whatsapp_leads").update({ breakdown_data: { ...next, closed: true }, status: "closed", ai_paused: true, closed_at: new Date().toISOString(), ai_summary: summary, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      const alert = await sendTelegramAlert({ name: leadName, phone, reason: caseError ? "Breakdown case requires manual CRM review" : "Breakdown media verified and customer confirmed closure", leadId, history: [...history, { sender: "ai_agent", content: summary }, { sender: "ai_agent", content: reply }], mediaUrl, closed: true });
      return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert, breakdown_case_saved: !caseError });
    }
    next.keyMediaChecked = mediaComplete;
    const reply = mediaUrl && normalizedMediaType === "image" && photoVerification && photoVerification.status !== "verified"
      ? `📷 Photo received. ${photoVerification.reason}\n\nPlease send a clear photo showing the key inside the letter box. I will check it again before continuing.`
      : mediaComplete
        ? "✅ The key photo has been checked and the key video has been received. Please check that everything is correct. Is that all for today? Reply Yes or No."
        : `🛠️ Emergency Breakdown\n\nI still need ${!next.keyPhotoUrl ? "one clear photo" : "one clear video"} of the key after it has been placed in the letter box. Please send the missing file here.`;
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    await db.from("whatsapp_leads").update({ breakdown_data: next, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert, breakdown_media_complete: mediaComplete });
  }

  if (!option && leadIntent === "report_accident") {
    const next: AccidentData = { ...accidentData, evidenceUrls: [...(accidentData.evidenceUrls ?? [])] };
    const lowerLast = lastAgentMessage.toLowerCase();

    if (!next.driverName || !next.driverReg) {
      const reg = extractReg(content);
      if (reg) {
        next.driverReg = next.driverReg ?? reg;
        const possibleName = content.replace(reg, "").replace(/^[\\s,;:-]+|[\\s,;:-]+$/g, "").trim();
        if (possibleName && isLikelyFullName(possibleName)) next.driverName = next.driverName ?? possibleName;
      } else if (!next.driverName && isLikelyFullName(content)) {
        next.driverName = content.trim();
      }
      if (!next.driverName || !next.driverReg) {
        const reply = `🚨 Accident verification\\n\\nPlease send the missing detail: ${!next.driverName ? "your full name" : "your vehicle registration"}.`;
        const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
        if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
        await db.from("whatsapp_leads").update({ accident_data: next, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
        const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
        return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert });
      }
    }

    if (!next.verified && next.driverName && next.driverReg) {
      const { data: drivers } = await db
        .from("driver_tracks")
        .select("vehicle_id, reg, driver_name")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(500);
      const driver = (drivers ?? []).find((candidate: { vehicle_id?: string | null; reg?: string | null; driver_name?: string | null }) =>
        normalizeReg(candidate.reg ?? "") === normalizeReg(next.driverReg ?? "") &&
        normalizeDriverName(candidate.driver_name ?? "") === normalizeDriverName(next.driverName ?? ""),
      );
      if (!driver) {
        const reply = "🚨 I could not verify that driver name and registration together in our CRM. Please check the spelling and registration and send them again.";
        const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
        if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
        const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
        return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert });
      }
      next.verified = true;
      next.vehicleId = driver.vehicle_id ?? null;
      customerType = "existing_customer";
      const reply = "✅ Your driver details have been verified in our CRM. Please now send the following information:\\n\\n1. The other driver’s full name and a clear picture of their driving licence\\n2. Their vehicle registration\\n3. The date and time of the accident\\n4. The place of the accident\\n5. A description of what happened\\n6. All photos and videos of the accident\\n\\nYou can send the details in separate messages. I will tell you if anything is still missing.";
      const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
      if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
      await db.from("whatsapp_leads").update({ accident_data: next, customer_type: customerType, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
      return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert });
    }

    const licenseUrl = labeledValue(content, ["licence", "license", "driving licence", "driving license"]) ? mediaUrl : null;
    next.atFaultDriverLicenseUrl = next.atFaultDriverLicenseUrl ?? licenseUrl ?? undefined;
    next.atFaultDriverName = next.atFaultDriverName ?? labeledValue(content, ["other driver", "driver name", "their name"]) ?? undefined;
    next.atFaultVehicleReg = next.atFaultVehicleReg ?? labeledValue(content, ["their car reg", "their vehicle reg", "other car reg", "other vehicle registration"]) ?? extractReg(content) ?? undefined;
    next.incidentDate = next.incidentDate ?? labeledValue(content, ["date", "accident date"]) ?? extractDate(content) ?? undefined;
    next.incidentTime = next.incidentTime ?? labeledValue(content, ["time", "accident time"]) ?? extractTime(content) ?? undefined;
    next.location = next.location ?? labeledValue(content, ["place", "location", "accident location"]) ?? undefined;
    next.description = next.description ?? labeledValue(content, ["description", "what happened", "details"]) ?? undefined;
    const evidenceUrls = next.evidenceUrls ?? (next.evidenceUrls = []);
    if (mediaUrl && !evidenceUrls.includes(mediaUrl)) evidenceUrls.push(mediaUrl);

    const missing = accidentMissing(next);
    if (lowerLast.includes("is this information correct") && isTermsResponse(content)) {
      if (/^yes[.!\\s]*$/i.test(content.trim())) {
        const summary = formatAccidentSummary(next).replace(/\\n\\nIs this information correct\\? Please reply Yes or No\\./, "");
        const { error: caseError } = await db.from("accident_cases").insert({
          user_id: userId,
          vehicle_id: next.vehicleId ?? null,
          source_lead_id: leadId,
          customer_phone: phone,
          reg: next.driverReg ?? "",
          driver_name: next.driverName ?? "",
          at_fault_driver_name: next.atFaultDriverName,
          at_fault_driver_license_url: next.atFaultDriverLicenseUrl,
          at_fault_vehicle_reg: next.atFaultVehicleReg,
          incident_date: next.incidentDate,
          incident_time: next.incidentTime,
          location: next.location,
          description: next.description,
          evidence_urls: next.evidenceUrls,
          ai_summary: summary,
          severity: "minor",
          status: "open",
        } as never);
        if (caseError) console.error("[agent-webhook] accident case insert failed", { leadId, error: caseError.message });
        const reply = "✅ Thank you. Your accident report has been saved and sent to our team for review. This conversation is now closed.";
        const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
        if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, handoff: true, session_id: sessionId });
        await db.from("whatsapp_leads").update({ accident_data: next, customer_type: "existing_customer", status: "closed", ai_paused: true, closed_at: new Date().toISOString(), ai_summary: summary, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
        const alert = await sendTelegramAlert({ name: leadName, phone, reason: caseError ? "Accident report requires manual CRM review" : "Verified accident report confirmed by customer", leadId, history: [...history, { sender: "ai_agent", content: summary }, { sender: "ai_agent", content: reply }], mediaUrl, closed: true });
        return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert, accident_case_saved: !caseError });
      }
      const reply = "No problem. Please tell me which part is incorrect, and I will update the accident report.";
      const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
      if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
      await db.from("whatsapp_leads").update({ accident_data: next, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
      return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound });
    }

    const reply = missing.length
      ? `🚨 Accident report\\n\\nThank you. I still need ${missing.join(", ")}. Please send the missing information; you can send photos and videos as separate messages.`
      : formatAccidentSummary(next);
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    if (outbound.sent) await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, session_id: sessionId });
    await db.from("whatsapp_leads").update({ accident_data: next, customer_type: customerType, ai_summary: reply, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({ name: leadName, phone, reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [...history, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, outbound, telegram_alert: alert, missing });
  }

  if (!option && isTermsResponse(content) && lastAgentMessage.toLowerCase().includes("are you fully aware")) {
    const answer = content.trim();
    const summary = formatCarHandoffSummary(carEligibility, answer);
    const reply = HANDOFF_24H;
    await insertWithSessionFallback(db, "messages", { user_id: userId, lead_id: leadId, sender: "ai_agent", content: reply, handoff: true, session_id: sessionId });
    await db.from("whatsapp_leads").update({ status: "needs_human", customer_type: "needs_human", ai_paused: true, intent: leadIntent ?? "book_car", ai_summary: summary, last_message_at: new Date().toISOString() } as never).eq("id", leadId);
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    const alert = await sendTelegramAlert({ name: leadName, phone, reason: outbound.sent ? summary : `WhatsApp Cloud API reply failed: ${outbound.reason}`, leadId, history: [{ sender: "ai_agent", content: summary }, { sender: "ai_agent", content: reply }], mediaUrl, closed: false });
    return json({ ok: true, lead_id: leadId, reply, needs_human: true, telegram_alert: alert, outbound });
  }

  if (option === 3) {
    const reply =
      "🚨 Accident Support\n\nWe are sorry to hear you have been in an accident. To begin verification, please send your full name and the vehicle registration you drive for Virtual Car Hire.";
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
        status: "active",
        ai_paused: false,
        closed_at: null,
        intent: "report_accident",
        ai_summary: reply,
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", leadId);
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    const alert = outbound.sent ? { sent: false, reason: "not_needed" } : await sendTelegramAlert({
      name: leadName,
      phone,
      reason: `WhatsApp Cloud API reply failed: ${outbound.reason}`,
      leadId,
      history: [...history, { sender: "ai_agent", content: reply }],
      mediaUrl,
      closed: false,
    });
    return json({ ok: true, lead_id: leadId, reply: outbound.sent ? reply : null, needs_human: !outbound.sent, telegram_alert: alert, outbound });
  }

  if (isPositiveClosure(content)) {
    const reply = `Thanks for contacting Virtual Car Hire.\n\n${HANDOFF_24H}`;
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
    const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: reply });
    const alert = await sendTelegramAlert({
      name: leadName,
      phone,
      reason: outbound.sent ? "Customer confirmed closure" : `WhatsApp Cloud API reply failed: ${outbound.reason}`,
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
  console.info("[agent-webhook] awaiting Meta WhatsApp AI dispatch", { leadId, transportSession: "meta-cloud-api", chatId: chatId ?? phone, hasPhone: Boolean(phone || chatId) });
  const outbound = await sendWhatsAppText({ phone: phone ?? chatId, text: finalReply,  });
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
  console.info("[agent-webhook] Meta WhatsApp AI dispatch complete", { leadId, sent: outbound.sent, reason: outbound.sent ? undefined : outbound.reason });
  const deliveryFailed = !outbound.sent;
  let alert: { sent: boolean; reason?: string } = { sent: false, reason: "not_needed" };
  if (needsHuman || deliveryFailed) {
    alert = await sendTelegramAlert({
      name: leadName,
      phone,
      reason: deliveryFailed ? `WhatsApp Cloud API reply failed: ${outbound.reason}` : (ai.reason || "AI trouble or customer needs help"),
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
