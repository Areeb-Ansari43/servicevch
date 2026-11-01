import { supabase } from "@/integrations/supabase/client";

export type BotCatalogEntry = {
  id?: string;
  display_name: string;
  make: string;
  model: string;
  aliases: string[];
  crm_make_pattern: string;
  crm_model_pattern: string;
  crm_year_min?: number | null;
  crm_year_max?: number | null;
  crm_regs?: string[] | null;
  weekly_rent: number;
  monthly_miles: number;
  deposit?: number | null;
  minimum_term_weeks: number;
  year_label: string;
  fuel_type?: string | null;
  fuel_group?: string | null;
  active: boolean;
  notes?: string | null;
};

export const DEFAULT_BOT_CATALOG: BotCatalogEntry[] = [
  {
    display_name: "Mercedes EQE",
    make: "Mercedes-Benz",
    model: "EQE",
    aliases: ["eqe", "mercedes eqe", "eqe 300", "eqe 350"],
    crm_make_pattern: "mercedes",
    crm_model_pattern: "eqe",
    crm_year_min: 2023,
    crm_year_max: 2024,
    weekly_rent: 440,
    monthly_miles: 4500,
    deposit: 1000,
    minimum_term_weeks: 8,
    year_label: "2023-2024",
    fuel_type: "Electric",
    fuel_group: "electric",
    active: true,
  },
  {
    display_name: "Mercedes E300",
    make: "Mercedes-Benz",
    model: "E300",
    aliases: ["e300", "e 300", "mercedes e300"],
    crm_make_pattern: "mercedes",
    crm_model_pattern: "e300",
    crm_year_min: 2019,
    crm_year_max: 2019,
    weekly_rent: 280,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 8,
    year_label: "2019",
    fuel_type: "Plug-in-Hybrid",
    fuel_group: "plug_in_hybrid",
    active: true,
  },
  {
    display_name: "Mercedes E220D",
    make: "Mercedes-Benz",
    model: "E220D",
    aliases: ["e220", "e 220", "e220d", "mercedes e220", "mercedes e220d", "e-class"],
    crm_make_pattern: "mercedes",
    crm_model_pattern: "e220",
    crm_year_min: 2018,
    crm_year_max: 2019,
    weekly_rent: 270,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2018-2019",
    fuel_type: "Diesel",
    fuel_group: "diesel",
    active: true,
  },
  {
    display_name: "Mercedes Vito",
    make: "Mercedes-Benz",
    model: "Vito",
    aliases: ["vito", "mercedes vito"],
    crm_make_pattern: "mercedes",
    crm_model_pattern: "vito",
    crm_year_min: 2016,
    crm_year_max: 2019,
    weekly_rent: 370,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 8,
    year_label: "2016-2019",
    fuel_type: "Diesel",
    fuel_group: "diesel",
    active: true,
  },
  {
    display_name: "Toyota Corolla",
    make: "Toyota",
    model: "Corolla",
    aliases: ["corolla", "toyota corolla", "corolla estate"],
    crm_make_pattern: "toyota",
    crm_model_pattern: "corolla",
    crm_year_min: 2019,
    crm_year_max: 2019,
    weekly_rent: 210,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2019",
    fuel_type: "Petrol",
    fuel_group: "petrol",
    active: true,
  },
  {
    display_name: "Toyota Auris",
    make: "Toyota",
    model: "Auris",
    aliases: ["auris", "toyota auris", "auris estate"],
    crm_make_pattern: "toyota",
    crm_model_pattern: "auris",
    crm_year_min: 2019,
    crm_year_max: 2019,
    weekly_rent: 210,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2019",
    fuel_type: "Hybrid",
    fuel_group: "hybrid",
    active: true,
  },
  {
    display_name: "Toyota Prius",
    make: "Toyota",
    model: "Prius",
    aliases: ["prius", "toyota prius"],
    crm_make_pattern: "toyota",
    crm_model_pattern: "prius",
    crm_year_min: 2016,
    crm_year_max: 2017,
    weekly_rent: 200,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2016-2017",
    fuel_type: "Hybrid",
    fuel_group: "hybrid",
    active: true,
  },
  {
    display_name: "Tesla Model 3",
    make: "Tesla",
    model: "Model 3",
    aliases: ["model 3", "tesla model 3", "tesla 3", "model3"],
    crm_make_pattern: "tesla",
    crm_model_pattern: "model3",
    crm_year_min: 2019,
    crm_year_max: 2021,
    weekly_rent: 260,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2019-2021",
    fuel_type: "Electric",
    fuel_group: "electric",
    active: true,
  },
  {
    display_name: "Jaguar I-Pace",
    make: "Jaguar",
    model: "I-Pace",
    aliases: ["i pace", "ipace", "jaguar ipace", "jaguar i-pace"],
    crm_make_pattern: "jaguar",
    crm_model_pattern: "ipace",
    crm_year_min: 2020,
    crm_year_max: 2020,
    weekly_rent: 270,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2020",
    fuel_type: "Electric",
    fuel_group: "electric",
    active: true,
  },
  {
    display_name: "Hyundai Santa Fe (2023-2025)",
    make: "Hyundai",
    model: "Santa Fe",
    aliases: ["santa fe", "hyundai santa fe", "santa fe plug in", "santa fe 2023", "santa fe 2024", "santa fe 2025"],
    crm_make_pattern: "hyundai",
    crm_model_pattern: "santafe",
    crm_year_min: 2023,
    crm_year_max: 2025,
    weekly_rent: 330,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 8,
    year_label: "2023-2025",
    fuel_type: "Plug-in-Hybrid",
    fuel_group: "plug_in_hybrid",
    active: true,
  },
  {
    display_name: "Hyundai Santa Fe (2026)",
    make: "Hyundai",
    model: "Santa Fe",
    aliases: ["santa fe 2026", "2026 santa fe", "new santa fe", "santa fe lb76buj"],
    crm_make_pattern: "hyundai",
    crm_model_pattern: "santafe",
    crm_year_min: 2026,
    crm_year_max: 2026,
    crm_regs: ["LB76BUJ"],
    weekly_rent: 370,
    monthly_miles: 5000,
    deposit: null,
    minimum_term_weeks: 8,
    year_label: "2026",
    fuel_type: null,
    fuel_group: null,
    active: true,
    notes: "Deposit and fuel type to be confirmed by team",
  },
  {
    display_name: "Hyundai Ioniq",
    make: "Hyundai",
    model: "Ioniq",
    aliases: ["ioniq", "hyundai ioniq"],
    crm_make_pattern: "hyundai",
    crm_model_pattern: "ioniq",
    crm_year_min: 2020,
    crm_year_max: 2022,
    weekly_rent: 210,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2020-2022",
    fuel_type: "Plug-in-Hybrid",
    fuel_group: "plug_in_hybrid",
    active: true,
  },
  {
    display_name: "MG 5 EV",
    make: "MG",
    model: "MG5 EV",
    aliases: ["mg5", "mg 5", "mg5 ev", "mg 5 ev", "5 ev"],
    crm_make_pattern: "mg",
    crm_model_pattern: "mg5",
    crm_year_min: 2021,
    crm_year_max: 2022,
    weekly_rent: 200,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2021-2022",
    fuel_type: "Electric",
    fuel_group: "electric",
    active: true,
  },
  {
    display_name: "MG S9",
    make: "MG",
    model: "S9",
    aliases: ["mg s9", "s9", "mgs9", "mg s9 phev"],
    crm_make_pattern: "mg",
    crm_model_pattern: "s9",
    crm_year_min: 2023,
    crm_year_max: 2025,
    weekly_rent: 280,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2023-2025",
    fuel_type: "Plug-in-Hybrid",
    fuel_group: "plug_in_hybrid",
    active: true,
  },
  {
    display_name: "Ford Tourneo Custom",
    make: "Ford",
    model: "Tourneo Custom",
    aliases: ["tourneo", "ford tourneo", "tourneo custom"],
    crm_make_pattern: "ford",
    crm_model_pattern: "tourneo",
    crm_year_min: 2024,
    crm_year_max: 2025,
    weekly_rent: 410,
    monthly_miles: 5000,
    deposit: 500,
    minimum_term_weeks: 6,
    year_label: "2024-2025",
    fuel_type: "Electric",
    fuel_group: "electric",
    active: true,
  },
];

export async function getBotCatalogFromDb(): Promise<BotCatalogEntry[]> {
  try {
    const { data, error } = await supabase
      .from("bot_fleet_catalog" as any)
      .select("*")
      .eq("active", true)
      .order("weekly_rent", { ascending: true });

    if (error || !data || data.length === 0) {
      return DEFAULT_BOT_CATALOG;
    }
    return data as BotCatalogEntry[];
  } catch {
    return DEFAULT_BOT_CATALOG;
  }
}

function cleanString(str?: string | null): string {
  return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type CrmVehicle = {
  id?: string;
  reg: string;
  make: string;
  model: string;
  year?: number | null;
  fuel_type?: string | null;
  status?: string | null;
  next_mot_date?: string | null;
  pco_expiry_date?: string | null;
  driver_id?: string | null;
  active_driver?: boolean | null;
};

export type RentableCheckResult = {
  rentable: boolean;
  reason?: string;
};

/**
 * Rentable Criteria:
 * - Status is NOT 'rented', 'inservice', 'in_service', 'maintenance', 'offroad', 'off_road', 'assigned'.
 * - Must NOT be assigned to an active driver.
 * - MOT must NOT be expired (next_mot_date > today).
 * - PCO expiry (if present) must NOT be expired.
 */
export function isVehicleRentable(v: CrmVehicle, todayStr = new Date().toISOString().split("T")[0]): RentableCheckResult {
  const status = (v.status || "").toLowerCase().replace(/[\s_-]/g, "");

  if (status.includes("rent")) {
    return { rentable: false, reason: "Status is Rented (currently with driver)" };
  }
  if (status.includes("service") || status.includes("maint") || status.includes("offroad") || status.includes("off_road")) {
    return { rentable: false, reason: "In service or maintenance" };
  }
  if (status.includes("assign") || v.active_driver || (v.driver_id && status !== "available")) {
    return { rentable: false, reason: "Assigned to an active driver" };
  }

  if (v.next_mot_date) {
    const motDate = v.next_mot_date.slice(0, 10);
    if (motDate < todayStr) {
      return { rentable: false, reason: `MOT expired on ${motDate}` };
    }
  }

  if (v.pco_expiry_date) {
    const pcoDate = v.pco_expiry_date.slice(0, 10);
    if (pcoDate < todayStr) {
      return { rentable: false, reason: `PCO licence expired on ${pcoDate}` };
    }
  }

  return { rentable: true };
}

export function matchesCatalogEntry(catalog: BotCatalogEntry, vehicle: CrmVehicle): boolean {
  if (catalog.crm_regs && catalog.crm_regs.length > 0) {
    const vReg = cleanString(vehicle.reg);
    if (!catalog.crm_regs.some((r) => cleanString(r) === vReg)) {
      return false;
    }
  }

  const vMake = cleanString(vehicle.make);
  const vModel = cleanString(vehicle.model);
  const patMake = cleanString(catalog.crm_make_pattern || catalog.make);
  const patModel = cleanString(catalog.crm_model_pattern || catalog.model);

  if (!vMake.includes(patMake) && !patMake.includes(vMake)) {
    return false;
  }
  if (!vModel.includes(patModel) && !patModel.includes(vModel)) {
    return false;
  }

  if (catalog.crm_year_min && vehicle.year && vehicle.year < catalog.crm_year_min) {
    return false;
  }
  if (catalog.crm_year_max && vehicle.year && vehicle.year > catalog.crm_year_max) {
    return false;
  }

  return true;
}

export type CatalogAvailabilitySummary = {
  catalog: BotCatalogEntry;
  matchedVehicles: CrmVehicle[];
  rentableVehicles: CrmVehicle[];
  isAvailable: boolean;
  exclusionReasons: Array<{ reg: string; reason: string }>;
};

export function evaluateFleetAvailability(
  catalogList: BotCatalogEntry[],
  crmVehicles: CrmVehicle[],
  todayStr?: string,
): {
  summaries: CatalogAvailabilitySummary[];
  unmatchedCatalog: BotCatalogEntry[];
  unmatchedCrmVehicles: CrmVehicle[];
} {
  const summaries: CatalogAvailabilitySummary[] = [];
  const matchedCrmIds = new Set<string>();

  for (const item of catalogList) {
    const matches = crmVehicles.filter((v) => matchesCatalogEntry(item, v));
    matches.forEach((v) => {
      if (v.id || v.reg) matchedCrmIds.add(v.id || v.reg);
    });

    const rentableList: CrmVehicle[] = [];
    const exclusions: Array<{ reg: string; reason: string }> = [];

    for (const v of matches) {
      const check = isVehicleRentable(v, todayStr);
      if (check.rentable) {
        rentableList.push(v);
      } else {
        exclusions.push({ reg: v.reg, reason: check.reason || "Excluded" });
      }
    }

    summaries.push({
      catalog: item,
      matchedVehicles: matches,
      rentableVehicles: rentableList,
      isAvailable: rentableList.length > 0,
      exclusionReasons: exclusions,
    });
  }

  const unmatchedCatalog = summaries
    .filter((s) => s.matchedVehicles.length === 0)
    .map((s) => s.catalog);

  const unmatchedCrmVehicles = crmVehicles.filter(
    (v) => !matchedCrmIds.has(v.id || v.reg),
  );

  return { summaries, unmatchedCatalog, unmatchedCrmVehicles };
}
