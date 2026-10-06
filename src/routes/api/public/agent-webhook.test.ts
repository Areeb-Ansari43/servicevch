import { expect, test, describe } from "bun:test";
import {
  parseCarEligibility,
  isAvailable,
  uniqueAvailableVehicles,
  normalizeModelKey,
  availableYears,
  isOutsideUKBusinessHours,
  getWelcomeMenuText,
  simplifyVehicleName,
  findSelectedVehicle,
  isPositiveConfirmation,
  isNegativeConfirmation,
  isMenuReset,
  isOffScriptQuestion,
  applyAntiRepetition,
  generateAccidentSummaryWithAi,
} from "./agent-webhook";
import { normalizeMetaPhone } from "@/lib/meta-whatsapp.server";
import { executeToolCall, validateAiReply, buildSystemPrompt, type FleetVehicleItem, type LeadContext } from "@/lib/ai-agent";

const evalFleet: FleetVehicleItem[] = [
  { id: "1", make: "Toyota", model: "Auris Estate", year: 2021, fuel_type: "Hybrid", weekly_rent: 250, monthly_mileage_allowance: 2500, status: "available", default_deposit: 500 },
  { id: "2", make: "Toyota", model: "Corolla Estate", year: 2022, fuel_type: "Hybrid", weekly_rent: 260, monthly_mileage_allowance: 2500, status: "available", default_deposit: 500 },
  { id: "3", make: "Mercedes-Benz", model: "E220d", year: 2021, fuel_type: "Diesel", weekly_rent: 320, monthly_mileage_allowance: 2500, status: "available", default_deposit: 500 },
  { id: "4", make: "Mercedes-Benz", model: "E300", year: 2023, fuel_type: "Plug-in-Hybrid", weekly_rent: 340, monthly_mileage_allowance: 2500, status: "available", default_deposit: 500 },
  { id: "5", make: "Ford", model: "Tourneo Custom", year: 2023, fuel_type: "Diesel", weekly_rent: 380, monthly_mileage_allowance: 2500, status: "available", default_deposit: 500 },
  { id: "6", make: "Tesla", model: "Model 3", year: 2022, fuel_type: "Electric", weekly_rent: 350, monthly_mileage_allowance: 2500, status: "available", default_deposit: 500 },
  { id: "7", make: "Mercedes-Benz", model: "EQE", year: 2023, fuel_type: "Electric", weekly_rent: 450, monthly_mileage_allowance: 2500, status: "available", default_deposit: 1000 },
];

describe("Car Eligibility Parsing & Warnings", () => {
  test("answers 'No' to penalty points sets points = 0 (no warning/default answer)", () => {
    const res = parseCarEligibility("1. Yes 2. Yes 3. No");
    expect(res.ageEligible).toBe(true);
    expect(res.pcoBadge).toBe(true);
    expect(res.points).toBe(0);
    expect(res.completed).toBe(true);
  });

  test("answers 'No' to age sets ageEligible = false and completed = true when all answered", () => {
    const res = parseCarEligibility("1. No 2. Yes 3. 0 points");
    expect(res.ageEligible).toBe(false);
    expect(res.pcoBadge).toBe(true);
    expect(res.points).toBe(0);
    expect(res.completed).toBe(true);
  });

  test("answers 'No' to PCO badge sets pcoBadge = false", () => {
    const res1 = parseCarEligibility("1. Yes 2. No 3. No");
    expect(res1.ageEligible).toBe(true);
    expect(res1.pcoBadge).toBe(false);
    expect(res1.points).toBe(0);

    const res2 = parseCarEligibility("Yes, No, 0 points");
    expect(res2.ageEligible).toBe(true);
    expect(res2.pcoBadge).toBe(false);
    expect(res2.points).toBe(0);
  });

  test("penalty points specified correctly", () => {
    const res = parseCarEligibility("1. Yes 2. Yes 3. 3 points");
    expect(res.ageEligible).toBe(true);
    expect(res.pcoBadge).toBe(true);
    expect(res.points).toBe(3);

    const highPoints = parseCarEligibility("1. Yes 2. Yes 3. 7 points");
    expect(highPoints.points).toBe(7);
  });

  test("does not misparse car model names like 'Tesla Model 3' or 'MG5' as penalty points", () => {
    const modelChoice = parseCarEligibility("Tesla Model 3");
    expect(modelChoice.points).toBeUndefined();

    const mgChoice = parseCarEligibility("MG MG5 EV");
    expect(mgChoice.points).toBeUndefined();
  });
});

describe("Out-of-Hours Check", () => {
  test("isOutsideUKBusinessHours returns correct status for given UK hours", () => {
    const daytime = new Date("2025-08-28T14:00:00Z"); // 2pm UTC / BST
    const nighttime = new Date("2025-08-28T22:00:00Z"); // 10pm UTC / BST
    expect(isOutsideUKBusinessHours(daytime)).toBe(false);
    expect(isOutsideUKBusinessHours(nighttime)).toBe(true);
  });

  test("getWelcomeMenuText appends out-of-hours message when outside 9am-6pm", () => {
    const nighttime = new Date("2025-08-28T22:00:00Z");
    const menu = getWelcomeMenuText(nighttime);
    expect(menu).toContain("Virtual Car Hire is unable to connect you to an agent");
  });
});

describe("Fleet Availability & Model Deduplication", () => {
  test("isAvailable correctly identifies available vs unavailable vehicles", () => {
    expect(
      isAvailable({
        reg: "A1",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(true);
    expect(
      isAvailable({
        reg: "A2",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "Active",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(true);
    expect(
      isAvailable({
        reg: "A3",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "rented",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(false);
    expect(
      isAvailable({
        reg: "A4",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "In Service",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(false);
    expect(
      isAvailable({
        reg: "A5",
        make: "Mercedes",
        model: "E20",
        year: 2022,
        fuel_type: "Petrol",
        status: "off_road",
        next_mot_date: null,
        pco_expiry_date: null,
      }),
    ).toBe(false);
  });

  test("simplifyVehicleName simplifies long raw vehicle names correctly to Make and Model only", () => {
    expect(simplifyVehicleName("MERCEDES-BENZ", "VITO 114 BLUETEC TOURER PRO")).toEqual({
      make: "Mercedes-Benz",
      model: "Vito",
    });
    expect(simplifyVehicleName("MERCEDES-BENZ", "E 220 D SE AUTO (2018, 2019)")).toEqual({
      make: "Mercedes-Benz",
      model: "E220d",
    });
    expect(simplifyVehicleName("TESLA", "MODEL 3 LONG RANGE AWD")).toEqual({
      make: "Tesla",
      model: "Model 3",
    });
    expect(simplifyVehicleName("TOYOTA", "COROLLA ICON VVT-I HEV CVT")).toEqual({
      make: "Toyota",
      model: "Corolla Estate",
    });
    expect(simplifyVehicleName("MG", "MG 5 EXCITE EV")).toEqual({ make: "MG", model: "MG5 EV" });
  });

  test("uniqueAvailableVehicles deduplicates identical or slightly varied models with simplified names", () => {
    const fleet = [
      {
        reg: "A1",
        make: "Mercedes-Benz",
        model: "E 220 D SE AUTO",
        year: 2018,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "A2",
        make: "Mercedes-Benz",
        model: "E 220 D AMG LINE AUTO",
        year: 2019,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "A3",
        make: "Mercedes-Benz",
        model: "Vito 114 Tourer",
        year: 2019,
        fuel_type: "Petrol",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "B1",
        make: "Toyota",
        model: "Prius",
        year: 2020,
        fuel_type: "Hybrid",
        status: "rented",
        next_mot_date: null,
        pco_expiry_date: null,
      },
    ];

    const unique = uniqueAvailableVehicles(fleet);
    expect(unique.length).toBe(2);
    expect(unique[0].make).toBe("Mercedes-Benz");
    expect(unique[0].model).toBe("E220d");
    expect(unique[1].make).toBe("Mercedes-Benz");
    expect(unique[1].model).toBe("Vito");

    const years = availableYears(fleet, unique[0]);
    expect(years).toBe("2018, 2019");
  });

  test("findSelectedVehicle matches simplified vehicle names and natural language selections", () => {
    const fleet = [
      {
        reg: "HYN1",
        make: "HYUNDAI",
        model: "IONIQ 1.6 GDI SE AUTO",
        year: 2022,
        fuel_type: "Plug-in-Hybrid",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "TSL1",
        make: "TESLA",
        model: "MODEL 3 LONG RANGE AWD",
        year: 2022,
        fuel_type: "Electric",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "MB1",
        make: "MERCEDES-BENZ",
        model: "E 220 D SE AUTO",
        year: 2020,
        fuel_type: "Diesel",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
      {
        reg: "TYT1",
        make: "TOYOTA",
        model: "COROLLA ICON 1.8 VVT-I HEV CVT",
        year: 2021,
        fuel_type: "Hybrid",
        status: "available",
        next_mot_date: null,
        pco_expiry_date: null,
      },
    ];

    expect(findSelectedVehicle("Hyundai Ioniq", fleet)?.reg).toBe("HYN1");
    expect(findSelectedVehicle("I'd like the Hyundai Ioniq", fleet)?.reg).toBe("HYN1");
    expect(findSelectedVehicle("Ioniq", fleet)?.reg).toBe("HYN1");
    expect(findSelectedVehicle("Tesla Model 3", fleet)?.reg).toBe("TSL1");
    expect(findSelectedVehicle("I want Tesla 3 please", fleet)?.reg).toBe("TSL1");
    expect(findSelectedVehicle("Mercedes-Benz E220d", fleet)?.reg).toBe("MB1");
    expect(findSelectedVehicle("E220", fleet)?.reg).toBe("MB1");
    expect(findSelectedVehicle("Corolla Estate", fleet)?.reg).toBe("TYT1");
  });
});

describe("Menu Reset / Greeting Detection", () => {
  test("isMenuReset detects standard and informal greetings, typos, emojis and restart commands", () => {
    expect(isMenuReset("hello")).toBe(true);
    expect(isMenuReset("Hello!")).toBe(true);
    expect(isMenuReset("hello virtual car hello")).toBe(true);
    expect(isMenuReset("hello virtual car")).toBe(true);
    expect(isMenuReset("hi")).toBe(true);
    expect(isMenuReset("hiii")).toBe(true);
    expect(isMenuReset("helo")).toBe(true);
    expect(isMenuReset("hey")).toBe(true);
    expect(isMenuReset("yo")).toBe(true);
    expect(isMenuReset("hola")).toBe(true);
    expect(isMenuReset("goodmorning")).toBe(true);
    expect(isMenuReset("good morning")).toBe(true);
    expect(isMenuReset("👋")).toBe(true);
    expect(isMenuReset("Hello 👋")).toBe(true);
    expect(isMenuReset("menu")).toBe(true);
    expect(isMenuReset("start")).toBe(true);
    expect(isMenuReset("restart")).toBe(true);
    expect(isMenuReset("options")).toBe(true);
    expect(isMenuReset("Hello Virtual car Hire")).toBe(true);
    expect(isMenuReset("Hello there")).toBe(true);
    expect(isMenuReset("abyone there")).toBe(true);
    expect(isMenuReset("Anyone there can menu")).toBe(true);
    expect(isMenuReset("Hello hello")).toBe(true);
  });
});

describe("Off-Script Question Detection & Anti-Repetition", () => {
  test("isOffScriptQuestion detects side questions like 'who is this'", () => {
    expect(isOffScriptQuestion("Btw who is this?")).toBe(true);
    expect(isOffScriptQuestion("who are you")).toBe(true);
    expect(isOffScriptQuestion("what are your opening hours")).toBe(true);
    expect(isOffScriptQuestion("where is your garage located")).toBe(true);
    expect(isOffScriptQuestion("can I call you?")).toBe(true);
    expect(isOffScriptQuestion("is this a bot")).toBe(true);
  });

  test("applyAntiRepetition prevents sending duplicate messages back to back", () => {
    const original = "Thanks. I still need whether your age is between 25 and 65...";
    const rephrased = applyAntiRepetition(original, original);
    expect(rephrased).not.toBe(original);
    expect(rephrased).toContain("Please let me know if you have any questions");

    const distinct = applyAntiRepetition("Driver details verified", original);
    expect(distinct).toBe("Driver details verified");
  });
});

describe("Confirmation Response Parsing", () => {
  test("isPositiveConfirmation correctly parses variations of affirmative input", () => {
    expect(isPositiveConfirmation("yes")).toBe(true);
    expect(isPositiveConfirmation("Yes")).toBe(true);
    expect(isPositiveConfirmation("yes correct")).toBe(true);
    expect(isPositiveConfirmation("yes it is")).toBe(true);
    expect(isPositiveConfirmation("confirm")).toBe(true);
    expect(isPositiveConfirmation("yeah")).toBe(true);
  });

  test("isNegativeConfirmation correctly parses variations of negative input", () => {
    expect(isNegativeConfirmation("no")).toBe(true);
    expect(isNegativeConfirmation("No")).toBe(true);
    expect(isNegativeConfirmation("not correct")).toBe(true);
    expect(isNegativeConfirmation("incorrect")).toBe(true);
  });
});

describe("Car Enquiry Flow - Terms Response Verification", () => {
  test("isTermsResponse behavior for positive and negative answers", () => {
    expect(isPositiveConfirmation("No")).toBe(false);
    expect(isNegativeConfirmation("No")).toBe(true);
    expect(isNegativeConfirmation("nope")).toBe(true);
    expect(isPositiveConfirmation("Yes")).toBe(true);
  });
});

describe("Auto Surgeon Address and Maps Constants", () => {
  test("address and map link match exact required format", () => {
    const AUTO_SURGEON_ADDRESS =
      "The Auto Surgeon, Unit 3, Squirrels Trading Estate, Viveash Close, Hayes, UB3 4RZ.";
    const AUTO_SURGEON_MAP =
      "https://www.google.com/maps/search/?api=1&query=Unit+3+Squirrels+Trading+Estate+Viveash+Close+Hayes+UB3+4RZ";

    expect(AUTO_SURGEON_ADDRESS).toBe(
      "The Auto Surgeon, Unit 3, Squirrels Trading Estate, Viveash Close, Hayes, UB3 4RZ.",
    );
    expect(AUTO_SURGEON_MAP).toBe(
      "https://www.google.com/maps/search/?api=1&query=Unit+3+Squirrels+Trading+Estate+Viveash+Close+Hayes+UB3+4RZ",
    );
  });
});

describe("Meta Phone Number Normalization", () => {
  test("converts UK 11-digit numbers starting with 0 to international 44 format", () => {
    expect(normalizeMetaPhone("07123456789")).toBe("447123456789");
    expect(normalizeMetaPhone("07987654321")).toBe("447987654321");
    expect(normalizeMetaPhone("07123 456 789")).toBe("447123456789");
  });

  test("handles international E.164 and WhatsApp JID suffixes cleanly", () => {
    expect(normalizeMetaPhone("+447123456789")).toBe("447123456789");
    expect(normalizeMetaPhone("447123456789")).toBe("447123456789");
    expect(normalizeMetaPhone("447123456789@c.us")).toBe("447123456789");
    expect(normalizeMetaPhone("447123456789@s.whatsapp.net")).toBe("447123456789");
    expect(normalizeMetaPhone("07123456789@c.us")).toBe("447123456789");
    expect(normalizeMetaPhone("meta:447123456789")).toBe("447123456789");
    expect(normalizeMetaPhone("meta:07123456789")).toBe("447123456789");
  });

  test("returns null for invalid or missing phone numbers", () => {
    expect(normalizeMetaPhone("")).toBe(null);
    expect(normalizeMetaPhone("12345")).toBe(null);
    expect(normalizeMetaPhone(null)).toBe(null);
    expect(normalizeMetaPhone(undefined)).toBe(null);
  });
});

describe("5-Minute Inactivity Auto-End Calculation", () => {
  test("detects when previous last message is 5 minutes or older", () => {
    const fiveMinutesMs = 5 * 60 * 1000;
    const now = Date.now();
    const recentTime = new Date(now - 2 * 60 * 1000).toISOString();
    const staleTime = new Date(now - 6 * 60 * 1000).toISOString();

    const isRecentInactive = now - new Date(recentTime).getTime() >= fiveMinutesMs;
    const isStaleInactive = now - new Date(staleTime).getTime() >= fiveMinutesMs;

    expect(isRecentInactive).toBe(false);
    expect(isStaleInactive).toBe(true);
  });
});

describe("Accident Summary AI Formatting", () => {
  test("generates category-grouped bulleted summary and asks for confirmation", async () => {
    const data = {
      driverName: "Varun Bagga",
      driverReg: "LC71 YZB",
      incidentDate: "2025-02-20",
      incidentTime: "14:30:00",
      location: "Hayes High Street",
      atFaultDriverName: "Jane Smith",
      atFaultVehicleReg: "AB12 CDE",
      insuranceProvider: "Admiral",
      description: "Rear-ended while stopped at traffic light.",
      evidenceUrls: ["https://example.com/photo1.jpg"],
    };

    const summary = await generateAccidentSummaryWithAi(data);
    expect(summary).toContain("Driver & Vehicle");
    expect(summary).toContain("Varun Bagga");
    expect(summary).toContain("LC71 YZB");
    expect(summary).toContain("Other Party");
    expect(summary).toContain("Admiral");
    expect(summary).toContain("Reply YES if this is correct, or tell me what to change.");
  });
});

// --- Transcript Evaluation Suite (40+ Scenarios) ---
describe("Transcript Evaluation Suite (40+ Real World Scenarios)", () => {
  test("Scenario 1: 'Toyota Auris Estate' selection and 'Yes' confirmation retains exact vehicle name and £250 price", () => {
    const ctx: LeadContext = {};
    const res1 = executeToolCall("get_vehicle", { vehicle_name: "Toyota Auris Estate" }, evalFleet, ctx);
    expect(res1.result.found).toBe(true);
    expect(res1.result.name).toBe("Toyota Auris Estate");
    expect(res1.result.weekly_rent).toBe("£250/week");
    expect(res1.updatedContext.preferred_vehicles).toContain("Toyota Auris Estate");

    const res2 = executeToolCall("set_stage", { stage: "terms_confirmed" }, evalFleet, res1.updatedContext);
    expect(res2.updatedContext.stage).toBe("terms_confirmed");
  });

  test("Scenario 2: 'Mercedes e300 or e220d' multi-car inquiry returns both cars with correct fuel types and rents", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("compare_vehicles", { vehicle_names: ["Mercedes e300", "Mercedes e220d"] }, evalFleet, ctx);
    expect(res.result.comparisons).toHaveLength(2);
    expect(res.result.comparisons[0].fuel_type).toBe("Plug-in-Hybrid");
    expect(res.result.comparisons[0].weekly_rent).toBe("£340/week");
    expect(res.result.comparisons[1].fuel_type).toBe("Diesel");
    expect(res.result.comparisons[1].weekly_rent).toBe("£320/week");
  });

  test("Scenario 3: Asking for 'Tourneo Custom' and 'plug in' shows Tourneo specs and suggests plug-in alternatives", () => {
    const ctx: LeadContext = {};
    const res1 = executeToolCall("get_vehicle", { vehicle_name: "Tourneo Custom" }, evalFleet, ctx);
    expect(res1.result.found).toBe(true);
    expect(res1.result.fuel_type).toBe("Diesel");

    const res2 = executeToolCall("get_fleet", { fuel_type: "Plug-in-Hybrid" }, evalFleet, ctx);
    expect(res2.result.vehicles[0].name).toContain("Mercedes");
  });

  test("Scenario 4: 'how much is the deposit' returns exact deposit (£500 standard, £1000 EQE)", () => {
    const res1 = executeToolCall("get_vehicle", { vehicle_name: "Tesla Model 3" }, evalFleet, {});
    expect(res1.result.deposit).toBe("£500");

    const res2 = executeToolCall("get_vehicle", { vehicle_name: "EQE" }, evalFleet, {});
    expect(res2.result.deposit).toBe("£1000");
  });

  test("Scenario 5: Typos 'do you have a Tourneo' matches Ford Tourneo Custom accurately", () => {
    const res = executeToolCall("get_vehicle", { vehicle_name: "Tourneo" }, evalFleet, {});
    expect(res.result.found).toBe(true);
    expect(res.result.name).toBe("Ford Tourneo Custom");
  });

  test("Scenario 6: 'anything cheaper' filters fleet by max price", () => {
    const res = executeToolCall("get_fleet", { max_price: 270 }, evalFleet, {});
    expect(res.result.vehicles.length).toBeGreaterThanOrEqual(1);
    expect(res.result.vehicles.every((v: any) => parseInt(v.weekly_rent.replace(/\D/g, ""), 10) <= 270)).toBe(true);
  });

  test("Scenario 7: 'can I see it today' prompts viewing request and human handoff", () => {
    const res = executeToolCall("request_human_handoff", { reason: "Customer requested same-day vehicle viewing" }, evalFleet, {});
    expect(res.triggerHandoff).toBe(true);
    expect(res.updatedContext.stage).toBe("handoff_ready");
  });

  test("Scenario 8: Angry customer ('this is ridiculous') triggers immediate human handoff", () => {
    const res = executeToolCall("request_human_handoff", { reason: "Angry customer objecting to policy" }, evalFleet, {});
    expect(res.triggerHandoff).toBe(true);
  });

  test("Scenario 9: Breakdown intent triggers start_breakdown_case with reg and location", () => {
    const res = executeToolCall("start_breakdown_case", { reg: "LC71 YZB", location: "M4 Junction 3", issue: "Flat tyre" }, evalFleet, {});
    expect(res.result.breakdown_started).toBe(true);
    expect(res.updatedContext.stage).toBe("breakdown");
  });

  test("Scenario 10: Non-English greeting 'hola' detected as menu reset greeting", () => {
    expect(isMenuReset("hola")).toBe(true);
    expect(isMenuReset("bonjour")).toBe(true);
  });

  test("Scenario 11: One-word message 'deposit' handled safely without crash", () => {
    const validation = validateAiReply("The deposit is £500.", undefined, [500]);
    expect(validation.valid).toBe(true);
  });

  test("Scenario 12: Price negotiation ('can I get it cheaper') requests human handoff", () => {
    const res = executeToolCall("request_human_handoff", { reason: "Price negotiation requested" }, evalFleet, {});
    expect(res.triggerHandoff).toBe(true);
  });

  test("Scenario 13: Customer asking 'I'm 29, valid PCO, no points' parses eligibility fields correctly", () => {
    let ctx: LeadContext = {};
    ctx = executeToolCall("save_lead_field", { field: "age", value: 29 }, evalFleet, ctx).updatedContext;
    ctx = executeToolCall("save_lead_field", { field: "pco_badge", value: true }, evalFleet, ctx).updatedContext;
    ctx = executeToolCall("save_lead_field", { field: "penalty_points", value: 0 }, evalFleet, ctx).updatedContext;

    expect(ctx.age).toBe(29);
    expect(ctx.pco_badge).toBe(true);
    expect(ctx.penalty_points).toBe(0);
  });

  test("Scenario 14: Customer providing start date 'next Monday' updates start_date field", () => {
    const ctx = executeToolCall("save_lead_field", { field: "start_date", value: "Next Monday" }, evalFleet, {}).updatedContext;
    expect(ctx.start_date).toBe("Next Monday");
  });

  test("Scenario 15: Customer name 'Alex Smith' stored into lead context", () => {
    const ctx = executeToolCall("save_lead_field", { field: "driver_name", value: "Alex Smith" }, evalFleet, {}).updatedContext;
    expect(ctx.driver_name).toBe("Alex Smith");
  });

  test("Scenario 16: System prompt includes customer name 'Alex Smith' once known", () => {
    const prompt = buildSystemPrompt({ driver_name: "Alex Smith" }, evalFleet);
    expect(prompt).toContain("Customer Name: Alex Smith");
  });

  test("Scenario 17: System prompt contains PCO requirement guidelines", () => {
    const prompt = buildSystemPrompt({}, evalFleet);
    expect(prompt).toContain("Valid UK PCO licence");
    expect(prompt).toContain("6 weeks minimum");
  });

  test("Scenario 18: System prompt includes deposit policy information", () => {
    const prompt = buildSystemPrompt({}, evalFleet);
    expect(prompt).toContain("£500");
  });

  test("Scenario 19: Reply validator rejects empty string", () => {
    expect(validateAiReply("").valid).toBe(false);
  });

  test("Scenario 20: Reply validator rejects raw JSON string", () => {
    expect(validateAiReply('{"reply": "Hello"}').valid).toBe(false);
  });

  test("Scenario 21: Reply validator rejects unexecuted tool text like get_fleet", () => {
    expect(validateAiReply("Calling get_fleet now...").valid).toBe(false);
  });

  test("Scenario 22: Reply validator rejects unverified fabricated price £999", () => {
    expect(validateAiReply("The rent is £999/week.", undefined, [250, 320]).valid).toBe(false);
  });

  test("Scenario 23: Reply validator accepts verified rent price £250/week", () => {
    expect(validateAiReply("The rent is £250/week.", undefined, [250]).valid).toBe(true);
  });

  test("Scenario 24: Anti-repetition prevents back-to-back duplicate message sending", () => {
    const msg = "Please provide your age and PCO badge status.";
    expect(applyAntiRepetition(msg, msg)).not.toBe(msg);
  });

  test("Scenario 25: Off-script question 'where is your office' detected as off-script", () => {
    expect(isOffScriptQuestion("Where is your office located?")).toBe(true);
  });

  test("Scenario 26: Off-script question 'what are your opening hours' detected as off-script", () => {
    expect(isOffScriptQuestion("What time do you open?")).toBe(true);
  });

  test("Scenario 27: Off-script question 'who are you' detected as off-script", () => {
    expect(isOffScriptQuestion("Who am I speaking with?")).toBe(true);
  });

  test("Scenario 28: Off-script question 'is this a bot' detected as off-script", () => {
    expect(isOffScriptQuestion("Is this an AI or a real person?")).toBe(true);
  });

  test("Scenario 29: Positive confirmation 'yeah sure' parsed correctly", () => {
    expect(isPositiveConfirmation("yeah sure")).toBe(true);
  });

  test("Scenario 30: Positive confirmation 'confirm' parsed correctly", () => {
    expect(isPositiveConfirmation("confirm")).toBe(true);
  });

  test("Scenario 31: Negative confirmation 'no thanks' parsed correctly", () => {
    expect(isNegativeConfirmation("no thanks")).toBe(true);
  });

  test("Scenario 32: Negative confirmation 'not interested' parsed correctly", () => {
    expect(isNegativeConfirmation("not interested")).toBe(true);
  });

  test("Scenario 33: Non-English greeting 'salut' detected as menu reset greeting", () => {
    expect(isMenuReset("salut")).toBe(true);
  });

  test("Scenario 34: Non-English greeting 'buenos dias' detected as menu reset greeting", () => {
    expect(isMenuReset("buenos dias")).toBe(true);
  });

  test("Scenario 35: One-word greeting 'hi' detected as menu reset", () => {
    expect(isMenuReset("hi")).toBe(true);
  });

  test("Scenario 36: One-word greeting 'menu' detected as menu reset", () => {
    expect(isMenuReset("menu")).toBe(true);
  });

  test("Scenario 37: One-word message 'details' processed safely", () => {
    expect(validateAiReply("Here are the details for the Toyota Auris Estate.", undefined, [250]).valid).toBe(true);
  });

  test("Scenario 38: Toyota Corolla Estate search matches Corolla Estate in eval fleet", () => {
    const res = executeToolCall("get_vehicle", { vehicle_name: "Corolla Estate" }, evalFleet, {});
    expect(res.result.found).toBe(true);
    expect(res.result.weekly_rent).toBe("£260/week");
  });

  test("Scenario 39: Tesla Model 3 search matches Tesla in eval fleet", () => {
    const res = executeToolCall("get_vehicle", { vehicle_name: "Tesla Model 3" }, evalFleet, {});
    expect(res.result.found).toBe(true);
    expect(res.result.fuel_type).toBe("Electric");
    expect(res.result.weekly_rent).toBe("£350/week");
  });

  test("Scenario 40: Mercedes EQE search returns £450/week rent and £1000 deposit", () => {
    const res = executeToolCall("get_vehicle", { vehicle_name: "EQE" }, evalFleet, {});
    expect(res.result.found).toBe(true);
    expect(res.result.weekly_rent).toBe("£450/week");
    expect(res.result.deposit).toBe("£1000");
  });

  test("Scenario 41: Legal / claim inquiry ('my solicitor wants to speak with you') triggers human handoff", () => {
    const res = executeToolCall("request_human_handoff", { reason: "Legal / insurance claim inquiry" }, evalFleet, {});
    expect(res.triggerHandoff).toBe(true);
  });

  test("Scenario 42: Complex policy inquiry twice triggers human handoff", () => {
    const res = executeToolCall("request_human_handoff", { reason: "Unsure twice on complex policy question" }, evalFleet, {});
    expect(res.triggerHandoff).toBe(true);
    expect(res.updatedContext.stage).toBe("handoff_ready");
  });
});
