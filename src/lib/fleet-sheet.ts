/**
 * Fleet price sheet helpers. The car list itself is generated from the sheet into
 * fleet-sheet.data.ts (Sheet 1 = each car's own weekly rent; Sheet 2 = per-model terms).
 * Excess mileage is always 20p a mile.
 */
import { EXCESS_RATE_PENCE, FLEET_SHEET, type FleetSheetCar } from "./fleet-sheet.data";

export { EXCESS_RATE_PENCE, FLEET_SHEET, type FleetSheetCar };

/** Sheet 2: per-model terms, used when a car is not on Sheet 1 (matched on make + model text). */
export const MODEL_TERMS: {
  match: RegExp;
  rent: number;
  monthlyMiles: number;
  deposit: number;
  termWeeks: number;
}[] = [
  { match: /eqe/i, rent: 440, monthlyMiles: 4500, deposit: 1000, termWeeks: 8 },
  { match: /e\s*-?\s*300/i, rent: 280, monthlyMiles: 5000, deposit: 500, termWeeks: 8 },
  { match: /e\s*-?\s*220/i, rent: 270, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /vito/i, rent: 370, monthlyMiles: 5000, deposit: 500, termWeeks: 8 },
  { match: /corolla/i, rent: 210, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /auris/i, rent: 210, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /prius/i, rent: 200, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /model\s*3/i, rent: 260, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /i-?\s*pace/i, rent: 270, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /santa\s*fe/i, rent: 370, monthlyMiles: 5000, deposit: 500, termWeeks: 8 },
  { match: /ioniq/i, rent: 210, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /mg\s*5|5\s*ev/i, rent: 200, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /\bs9\b/i, rent: 300, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
  { match: /tourneo/i, rent: 430, monthlyMiles: 5000, deposit: 500, termWeeks: 6 },
];

export const normaliseReg = (reg: string | null | undefined) =>
  String(reg ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();

export type CarTerms = {
  weeklyRent: number | null;
  monthlyAllowance: number | null;
  excessRatePence: number;
  deposit: number | null;
  source: "sheet" | "crm" | "model" | "none";
};

/**
 * Rent / allowance / excess for a car: its own row on Sheet 1 first, then the price saved on
 * the CRM vehicle, then the model's terms on Sheet 2. Excess is always 20p a mile.
 */
export function carTermsFor(v: {
  registration?: string | null;
  make?: string | null;
  model?: string | null;
  weekly_price?: number | null;
  monthly_allowance?: number | null;
  default_deposit?: number | null;
}): CarTerms {
  const row = FLEET_SHEET.find((c) => c.reg === normaliseReg(v.registration));
  if (row) {
    return {
      weeklyRent: row.rent,
      monthlyAllowance: row.monthlyMiles,
      excessRatePence: EXCESS_RATE_PENCE,
      deposit: row.deposit,
      source: "sheet",
    };
  }
  const text = `${v.make ?? ""} ${v.model ?? ""}`;
  const model = MODEL_TERMS.find((m) => m.match.test(text));
  const crmRent = Number(v.weekly_price) > 0 ? Number(v.weekly_price) : null;
  const crmMiles = Number(v.monthly_allowance) > 0 ? Number(v.monthly_allowance) : null;
  if (crmRent || model) {
    return {
      weeklyRent: crmRent ?? model?.rent ?? null,
      monthlyAllowance: model?.monthlyMiles ?? crmMiles,
      excessRatePence: EXCESS_RATE_PENCE,
      deposit: model?.deposit ?? (Number(v.default_deposit) > 0 ? Number(v.default_deposit) : null),
      source: crmRent ? "crm" : "model",
    };
  }
  return {
    weeklyRent: null,
    monthlyAllowance: crmMiles,
    excessRatePence: EXCESS_RATE_PENCE,
    deposit: null,
    source: "none",
  };
}
