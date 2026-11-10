/**
 * WhatsApp car enquiry: the fixed (non-AI) messages for the eligibility questions, the
 * available-car list and the car details. Every price, deposit, mileage allowance, term,
 * year and fuel type comes from the Settings bot catalogue (bot_fleet_catalog, seeded from
 * the fleet price sheet). CRM vehicles only decide which cars are available right now.
 */
import {
  DEFAULT_BOT_CATALOG,
  evaluateFleetAvailability,
  type BotCatalogEntry,
  type CatalogAvailabilitySummary,
  type CrmVehicle,
} from "@/lib/bot-catalog";

export const CAR_ELIGIBILITY_PROMPT =
  "🚗 Car Enquiry\n\n" +
  "Before we look at available vehicles, please answer 3 quick questions:\n\n" +
  "1. Are you aged between 25 and 65? (Yes / No)\n" +
  "2. Do you have a valid PCO badge? (Yes / No)\n" +
  "3. How many penalty points are on your licence? (0 if none)\n\n" +
  "You can answer all three in one message, for example: Yes, Yes, 0";

const YES = "yes|yeah|yep|yea|y";
const NO = "no|nope|nah|n";
const ANSWER = `${YES}|${NO}`;

/**
 * "Yes, Yes, 0", "yes yes no", "Yes yes 3 points", "1. Yes 2. Yes 3. 0", "yes, yes, none"
 * and the older "Yes Yes Yes - 3 points" all count as a reply to the three questions.
 */
export function isCompactEligibilityAnswer(text: string): boolean {
  const t = String(text || "")
    .toLowerCase()
    .replace(/(?:^|\s)[123]\s*[.)]\s*/g, " ")
    .trim();
  const sep = "[\\s,;|/.-]+";
  const third = `(?:${ANSWER}|none|zero|nil|\\d{1,2})`;
  const re = new RegExp(
    `^(?:${ANSWER})${sep}(?:${ANSWER})${sep}${third}(?:\\s*(?:points?|pts))?(?:\\s*[-–—:=]?\\s*\\d{1,2}\\s*(?:points?|pts)?)?[\\s.!]*$`,
    "i",
  );
  return re.test(t);
}

export type CatalogSummary = CatalogAvailabilitySummary;

export function buildCatalogSummaries(
  catalog: BotCatalogEntry[] | undefined | null,
  vehicles: CrmVehicle[],
  todayStr?: string,
): CatalogSummary[] {
  const list = (catalog && catalog.length ? catalog : DEFAULT_BOT_CATALOG).filter(
    (c) => c.active !== false,
  );
  return evaluateFleetAvailability(list, vehicles, todayStr).summaries;
}

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) || Number(n) <= 0
    ? null
    : `£${Number(n).toLocaleString("en-GB")}`;

export function carName(c: BotCatalogEntry): string {
  return c.display_name.replace(/\s*\(\d{4}[^)]*\)\s*$/, "").trim() || `${c.make} ${c.model}`;
}

/** Display name plus the year when two versions of the same car are listed. */
function labelFor(c: BotCatalogEntry, all: BotCatalogEntry[]): string {
  const name = carName(c);
  const twins = all.filter((o) => carName(o).toLowerCase() === name.toLowerCase());
  return twins.length > 1 && c.year_label ? `${name} (${c.year_label})` : name;
}

/** Cars that can be offered now. Falls back to the whole catalogue when the CRM
 *  has available cars that the catalogue patterns could not match, so cars are never hidden
 *  because of a naming mismatch. */
export function offerableSummaries(
  summaries: CatalogSummary[],
  crmHasAvailableCars: boolean,
): CatalogSummary[] {
  const available = summaries.filter((s) => s.isAvailable);
  if (available.length) return available;
  return crmHasAvailableCars ? summaries : [];
}

export function formatCatalogFleetList(offer: CatalogSummary[], noneMessage: string): string {
  if (!offer.length) return noneMessage;
  const sorted = [...offer].sort((a, b) => a.catalog.weekly_rent - b.catalog.weekly_rent);
  const all = sorted.map((s) => s.catalog);
  const lines = sorted.map((s) => {
    const c = s.catalog;
    const price = money(c.weekly_rent);
    const bits = [price ? `${price}/week` : null, c.fuel_type || null].filter(Boolean);
    return `• ${labelFor(c, all)}${bits.length ? ` - ${bits.join(", ")}` : ""}`;
  });
  return (
    "Great, thank you. These cars are available at the moment:\n\n" +
    `${lines.join("\n")}\n\n` +
    "Reply with the car you would like (you can name more than one to compare) and I will send the full details."
  );
}

const clean = (v: string) =>
  String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/**
 * Every catalogue car the customer named ("Mercedes Vito and MG5 EV" -> both). Only strong
 * matches (name, model or alias); a bare make like "Mercedes" does not pick a car.
 * Available cars are preferred when the same name matches an unavailable version too.
 */
export function findCatalogSelections(text: string, summaries: CatalogSummary[]): CatalogSummary[] {
  const q = clean(text);
  if (q.length < 2) return [];
  const hits = summaries.filter((s) => {
    const c = s.catalog;
    const names = [
      c.display_name,
      carName(c),
      c.model,
      `${c.make} ${c.model}`,
      ...(c.aliases || []),
    ]
      .map(clean)
      .filter((n) => n.length >= 3 || /\d/.test(n));
    return names.some((n) => n.length >= 2 && q.includes(n));
  });
  // A year in the message narrows versions (e.g. "Santa Fe 2026").
  const years = String(text).match(/\b20\d{2}\b/g) || [];
  let result = hits;
  if (years.length) {
    const narrowed = hits.filter((s) =>
      years.some((y) => clean(`${s.catalog.display_name} ${s.catalog.year_label}`).includes(y)),
    );
    if (narrowed.length) result = narrowed;
  }
  // Drop unavailable duplicates of the same car when an available one matched.
  const byName = new Map<string, CatalogSummary[]>();
  for (const s of result) {
    const k = clean(carName(s.catalog));
    byName.set(k, [...(byName.get(k) || []), s]);
  }
  const out: CatalogSummary[] = [];
  for (const group of byName.values()) {
    const avail = group.filter((s) => s.isAvailable);
    out.push(...(avail.length ? avail : group));
  }
  return out;
}

function detailLines(c: BotCatalogEntry): string[] {
  const rent = money(c.weekly_rent);
  const deposit = money(c.deposit ?? null);
  return [
    `💷 Weekly rent: ${rent ? rent : "our team will confirm"}`,
    `🔒 Deposit: ${deposit ? deposit : "our team will confirm"}`,
    `📅 Year: ${c.year_label || "our team will confirm"}`,
    `⛽ Fuel: ${c.fuel_type || "our team will confirm"}`,
    `🛣️ Mileage: ${Number(c.monthly_miles || 0).toLocaleString("en-GB")} miles per month`,
    `📝 Minimum term: ${c.minimum_term_weeks} weeks`,
    "✅ Included: PCO licensing, insurance, servicing and maintenance",
  ];
}

/** One car: full details and the Yes/No question (keeps "happy to proceed" for the next step). */
export function formatCatalogDetails(selection: CatalogSummary[], all: CatalogSummary[]): string {
  const allEntries = all.map((s) => s.catalog);
  if (selection.length === 1) {
    const s = selection[0];
    const c = s.catalog;
    const note = s.isAvailable
      ? ""
      : "\n\n⚠️ This car is fully booked at the moment. Our team can let you know when one is free.";
    return (
      `Here are the details for the ${labelFor(c, allEntries)}:\n\n${detailLines(c).join("\n")}${note}\n\n` +
      "Are you happy to proceed with this car? Reply Yes or No."
    );
  }
  const blocks = selection.map((s, i) => {
    const c = s.catalog;
    const flag = s.isAvailable ? "" : "\n⚠️ Fully booked at the moment";
    return `${i + 1}. ${labelFor(c, allEntries)}\n${detailLines(c).slice(0, 6).join("\n")}${flag}`;
  });
  return (
    "Here are the details for the cars you asked about:\n\n" +
    `${blocks.join("\n\n")}\n\n` +
    "✅ All include PCO licensing, insurance, servicing and maintenance.\n\n" +
    "Which one would you like to go ahead with? Reply with the car name."
  );
}

export function selectedVehicleFromCatalog(c: BotCatalogEntry) {
  const rent = money(c.weekly_rent);
  return {
    make: c.make,
    model: carName(c).replace(new RegExp(`^${c.make.split(/[\s-]/)[0]}\\s*`, "i"), "") || c.model,
    displayName: carName(c),
    year: c.year_label || null,
    weeklyRate: rent ? `${rent}/week` : "rent to be confirmed by the team",
    deposit: money(c.deposit ?? null),
    mileage: Number(c.monthly_miles || 0) || 5000,
    contractWeeks: Number(c.minimum_term_weeks || 0) || 6,
    fuel: c.fuel_type || null,
  };
}
