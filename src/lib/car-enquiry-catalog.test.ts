import { describe, expect, it } from "bun:test";
import { DEFAULT_BOT_CATALOG } from "@/lib/bot-catalog";
import {
  CAR_ELIGIBILITY_PROMPT,
  buildCatalogSummaries,
  findCatalogSelections,
  formatCatalogDetails,
  formatCatalogFleetList,
  isCompactEligibilityAnswer,
  offerableSummaries,
  selectedVehicleFromCatalog,
} from "./car-enquiry-catalog";
import { parseCarEligibility } from "@/routes/api/public/agent-webhook";

// CRM rows as they really look (names differ from the catalogue on purpose).
const crm = [
  {
    reg: "AA16VIT",
    make: "MERCEDES-BENZ",
    model: "VITO 114 CDI",
    year: 2018,
    fuel_type: "Petrol",
    status: "available",
  },
  {
    reg: "MG21EVA",
    make: "MG",
    model: "MG5 EV LONG RANGE",
    year: 2021,
    fuel_type: "Electric",
    status: "available",
  },
  {
    reg: "TP17PRI",
    make: "TOYOTA",
    model: "PRIUS",
    year: 2017,
    fuel_type: "Hybrid",
    status: "rented",
  },
  {
    reg: "EQ23EQE",
    make: "MERCEDES-BENZ",
    model: "EQE 300",
    year: 2023,
    fuel_type: "Electric",
    status: "available",
  },
];
const summaries = buildCatalogSummaries(DEFAULT_BOT_CATALOG, crm, "2026-11-10");
const offer = offerableSummaries(summaries, true);

describe("eligibility questions", () => {
  it("asks three clear questions with an example answer", () => {
    expect(CAR_ELIGIBILITY_PROMPT).toContain("Are you aged between 25 and 65? (Yes / No)");
    expect(CAR_ELIGIBILITY_PROMPT).toContain("Do you have a valid PCO badge? (Yes / No)");
    expect(CAR_ELIGIBILITY_PROMPT).toContain("How many penalty points");
    expect(CAR_ELIGIBILITY_PROMPT).toContain("Yes, Yes, 0");
  });

  it.each([
    ["Yes, Yes, 0", true, true, 0],
    ["yes yes no", true, true, 0],
    ["yes yes 3", true, true, 3],
    ["Yes Yes 3 points", true, true, 3],
    ["yes, yes, none", true, true, 0],
    ["1. Yes 2. Yes 3. 0", true, true, 0],
    ["Yes No 0", true, false, 0],
  ] as [string, boolean, boolean, number][])(
    "understands %p",
    (text: string, age: boolean, badge: boolean, points: number) => {
      expect(isCompactEligibilityAnswer(text)).toBe(true);
      const r = parseCarEligibility(text);
      expect(r.ageEligible).toBe(age);
      expect(r.pcoBadge).toBe(badge);
      expect(r.points).toBe(points);
    },
  );

  it("does not treat a car name or a question as the answer", () => {
    expect(isCompactEligibilityAnswer("Mercedes Vito and MG5 EV")).toBe(false);
    expect(isCompactEligibilityAnswer("yes what cars do you have")).toBe(false);
  });
});

describe("car list uses the price sheet", () => {
  it("lists only available cars with weekly rent and fuel from the catalogue, cheapest first", () => {
    const list = formatCatalogFleetList(offer, "none");
    expect(list).toContain("• MG 5 EV - £200/week, Electric");
    expect(list).toContain("• Mercedes Vito - £370/week, Diesel");
    expect(list).toContain("• Mercedes EQE - £440/week, Electric");
    expect(list).not.toContain("Prius"); // rented
    expect(list.indexOf("MG 5 EV")).toBeLessThan(list.indexOf("Mercedes Vito"));
  });

  it("shows the whole catalogue if the CRM has free cars the catalogue could not match", () => {
    const unmatched = buildCatalogSummaries(DEFAULT_BOT_CATALOG, [
      { reg: "X1", make: "Odd", model: "Name", status: "available" },
    ]);
    expect(offerableSummaries(unmatched, true).length).toBe(DEFAULT_BOT_CATALOG.length);
    expect(offerableSummaries(unmatched, false)).toEqual([]);
  });
});

describe("choosing cars (the screenshot conversation)", () => {
  it("'Mercedes Vito and MG5 EV' returns BOTH cars with real prices, never 'Price to confirm'", () => {
    const sel = findCatalogSelections("Mercedes Vito and MG5 EV", summaries);
    expect(sel.map((s) => s.catalog.display_name).sort()).toEqual(["MG 5 EV", "Mercedes Vito"]);
    const reply = formatCatalogDetails(sel, summaries);
    expect(reply).toContain("Mercedes Vito");
    expect(reply).toContain("£370");
    expect(reply).toContain("Diesel");
    expect(reply).toContain("2016-2019");
    expect(reply).toContain("MG 5 EV");
    expect(reply).toContain("£200");
    expect(reply).toContain("Which one would you like");
    expect(reply).not.toMatch(/price to confirm|petrol/i);
  });

  it("one car gets full details and the Yes/No step", () => {
    const sel = findCatalogSelections("vito", summaries);
    expect(sel).toHaveLength(1);
    const reply = formatCatalogDetails(sel, summaries);
    expect(reply).toContain("💷 Weekly rent: £370");
    expect(reply).toContain("🔒 Deposit: £500");
    expect(reply).toContain("📝 Minimum term: 8 weeks");
    expect(reply).toContain("🛣️ Mileage: 5,000 miles per month");
    expect(reply).toContain("happy to proceed");
    const v = selectedVehicleFromCatalog(sel[0].catalog);
    expect(v).toMatchObject({
      displayName: "Mercedes Vito",
      weeklyRate: "£370/week",
      deposit: "£500",
      contractWeeks: 8,
    });
  });

  it("a bare make or a plain 'yes' does not pick a car", () => {
    expect(findCatalogSelections("mercedes", summaries)).toEqual([]);
    expect(findCatalogSelections("yes", summaries)).toEqual([]);
  });

  it("a booked-out car says so instead of pretending it is free", () => {
    const sel = findCatalogSelections("prius", summaries);
    expect(formatCatalogDetails(sel, summaries)).toContain("fully booked");
  });
});
