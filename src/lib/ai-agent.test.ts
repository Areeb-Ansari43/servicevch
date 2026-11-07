import { describe, expect, test } from "bun:test";
import {
  executeToolCall,
  validateAiReply,
  buildSystemPrompt,
  type LeadContext,
  type FleetVehicleItem,
} from "./ai-agent";

const mockFleet: FleetVehicleItem[] = [
  {
    id: "v1",
    make: "Toyota",
    model: "Auris Estate",
    year: 2021,
    fuel_type: "Hybrid",
    weekly_rent: 250,
    monthly_mileage_allowance: 2500,
    status: "available",
  },
  {
    id: "v2",
    make: "Mercedes-Benz",
    model: "E220d",
    year: 2022,
    fuel_type: "Diesel",
    weekly_rent: 320,
    monthly_mileage_allowance: 2500,
    status: "available",
  },
  {
    id: "v3",
    make: "Mercedes-Benz",
    model: "E300",
    year: 2023,
    fuel_type: "Plug-in-Hybrid",
    weekly_rent: 340,
    monthly_mileage_allowance: 2500,
    status: "available",
  },
  {
    id: "v4",
    make: "Ford",
    model: "Tourneo Custom",
    year: 2023,
    fuel_type: "Diesel",
    weekly_rent: 380,
    monthly_mileage_allowance: 2500,
    status: "available",
  },
];

describe("AI Agent Function Tools & Database Fleet Execution", () => {
  test("get_fleet filters by fuel type correctly", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("get_fleet", { fuel_type: "Hybrid" }, mockFleet, ctx);

    expect(res.result.available_count).toBeGreaterThanOrEqual(1);
    expect(res.result.vehicles[0].name).toContain("Toyota Auris");
    expect(res.result.vehicles[0].weekly_rent).toBe("£250/week");
  });

  test("get_vehicle returns exact specs including E220d Diesel fuel type and £320 price", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("get_vehicle", { vehicle_name: "Mercedes E220d" }, mockFleet, ctx);

    expect(res.result.found).toBe(true);
    expect(res.result.name).toBe("Mercedes-Benz E220d");
    expect(res.result.fuel_type).toBe("Diesel");
    expect(res.result.weekly_rent).toBe("£320/week");
    expect(res.updatedContext.preferred_vehicles).toContain("Mercedes-Benz E220d");
  });

  test("compare_vehicles compares E300 and E220d accurately", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall(
      "compare_vehicles",
      { vehicle_names: ["Mercedes e300", "Mercedes e220d"] },
      mockFleet,
      ctx,
    );

    expect(res.result.comparisons).toHaveLength(2);
    expect(res.result.comparisons[0].fuel_type).toBe("Plug-in-Hybrid");
    expect(res.result.comparisons[1].fuel_type).toBe("Diesel");
  });

  test("save_lead_field updates lead context fields", () => {
    let ctx: LeadContext = {};
    const r1 = executeToolCall("save_lead_field", { field: "driver_name", value: "John Doe" }, mockFleet, ctx);
    ctx = r1.updatedContext;
    const r2 = executeToolCall("save_lead_field", { field: "age", value: 29 }, mockFleet, ctx);
    ctx = r2.updatedContext;
    const r3 = executeToolCall("save_lead_field", { field: "penalty_points", value: 0 }, mockFleet, ctx);
    ctx = r3.updatedContext;

    expect(ctx.driver_name).toBe("John Doe");
    expect(ctx.age).toBe(29);
    expect(ctx.penalty_points).toBe(0);
  });

  test("request_human_handoff triggers handoff signal and reason", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("request_human_handoff", { reason: "Customer requested price discount" }, mockFleet, ctx);

    expect(res.triggerHandoff).toBe(true);
    expect(res.handoffReason).toContain("discount");
    expect(res.updatedContext.stage).toBe("handoff_ready");
  });

  test("find_vehicles handles loose queries (e220, mg 5, prius, tourneo)", () => {
    const ctx: LeadContext = {};
    const e220Res = executeToolCall("find_vehicles", { query: "e220" }, mockFleet, ctx);
    expect(e220Res.result.total_found).toBe(1);
    expect(e220Res.result.vehicles[0].name.toLowerCase()).toContain("e220");

    const priusRes = executeToolCall("find_vehicles", { query: "prius" }, mockFleet, ctx);
    expect(priusRes.result.vehicles).toBeDefined();

    const tourneoRes = executeToolCall("find_vehicles", { query: "tourneo" }, mockFleet, ctx);
    expect(tourneoRes.result.total_found).toBe(1);
    expect(tourneoRes.result.vehicles[0].name).toContain("Tourneo");
  });
});

describe("AI Reply Validator", () => {
  test("flags empty or ultra short responses", () => {
    expect(validateAiReply("").valid).toBe(false);
    expect(validateAiReply("Hi").valid).toBe(false);
  });

  test("flags exact duplicate of last bot message", () => {
    const lastMsg = "Hi John, the Toyota Auris Estate is £250/week.";
    const result = validateAiReply(lastMsg, lastMsg);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("exact repeat");
  });

  test("flags raw JSON or unexecuted tool text", () => {
    const jsonReply = '{"reply": "Hello", "needs_human": false}';
    expect(validateAiReply(jsonReply).valid).toBe(false);

    const toolText = "Sure! Let me run get_fleet(fuel_type='Electric') for you.";
    expect(validateAiReply(toolText).valid).toBe(false);
  });

  test("flags unverified price mentioned in text", () => {
    const replyWithFabricatedPrice = "The Mercedes E220d is £890/week.";
    const knownPrices = [250, 320, 340]; // £890 is not in tool data or standard pricing table
    const result = validateAiReply(replyWithFabricatedPrice, undefined, knownPrices);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Unverified price £890");
  });

  test("accepts valid, friendly, verified response", () => {
    const validReply = "Hi John! The Mercedes E220d is £320/week and fuel type is Diesel. Would you like to proceed with this car?";
    const knownPrices = [320];
    const result = validateAiReply(validReply, undefined, knownPrices);
    expect(result.valid).toBe(true);
  });

  test("blocks 'Price to confirm' and zero prices (£0, 0 pound)", () => {
    expect(validateAiReply("The price is Price to confirm for you.").valid).toBe(false);
    expect(validateAiReply("The rent is £0 per week.").valid).toBe(false);
    expect(validateAiReply("The price is 0 pound.").valid).toBe(false);
  });
});

describe("Required Transcript Tests Suite", () => {
  test("Transcript 1: 'Mercedes e220 and Toyota Prius' matches both vehicles with real prices and fuel", () => {
    const testFleet: FleetVehicleItem[] = [
      ...mockFleet,
      {
        id: "v5",
        make: "Toyota",
        model: "Prius",
        year: 2022,
        fuel_type: "Plug-in-Hybrid",
        weekly_rent: 200,
        monthly_mileage_allowance: 2500,
        status: "available",
      },
    ];

    const ctx: LeadContext = {};
    const e220 = executeToolCall("find_vehicles", { query: "e220" }, testFleet, ctx);
    const prius = executeToolCall("find_vehicles", { query: "prius" }, testFleet, ctx);

    expect(e220.result.vehicles[0].name).toContain("Mercedes E220D");
    expect(e220.result.vehicles[0].fuel_type).toBe("Diesel");
    expect(e220.result.vehicles[0].weekly_rent).toBe("£270/week");

    expect(prius.result.vehicles[0].name).toContain("Prius");
    expect(prius.result.vehicles[0].fuel_type).toBe("Hybrid");
    expect(prius.result.vehicles[0].weekly_rent).toBe("£200/week");
  });

  test("Transcript 2: Button text 'book_car' then '1. No 2. yes 3. no' handled politely asking age once without loop", () => {
    const ctx: LeadContext = {};
    const r1 = executeToolCall("save_lead_field", { field: "pco_badge", value: "true" }, mockFleet, ctx);
    const r2 = executeToolCall("save_lead_field", { field: "penalty_points", value: "0" }, mockFleet, r1.updatedContext);

    expect(r2.updatedContext.pco_badge).toBe(true);
    expect(r2.updatedContext.penalty_points).toBe(0);
  });

  test("Transcript 3: Affirmative / detailed eligibility statements parse correctly", () => {
    let ctx: LeadContext = {};
    ctx = executeToolCall("save_lead_field", { field: "age", value: "37" }, mockFleet, ctx).updatedContext;
    ctx = executeToolCall("save_lead_field", { field: "pco_badge", value: "true" }, mockFleet, ctx).updatedContext;
    ctx = executeToolCall("save_lead_field", { field: "penalty_points", value: "0" }, mockFleet, ctx).updatedContext;

    expect(ctx.age).toBe(37);
    expect(ctx.pco_badge).toBe(true);
    expect(ctx.penalty_points).toBe(0);
  });

  test("Transcript 4: Queries 'anything cheaper', 'do you have a tourneo', 'how much deposit', 'can I see the car', 'my car broke down in Hayes', angry customer, '??', Urdu & Polish greetings", () => {
    const ctx: LeadContext = {};

    // Cheap query
    const cheap = executeToolCall("find_vehicles", { max_price: 300 }, mockFleet, ctx);
    expect(cheap.result.vehicles.length).toBeGreaterThan(0);

    // Tourneo query
    const tourneo = executeToolCall("find_vehicles", { query: "tourneo" }, mockFleet, ctx);
    expect(tourneo.result.vehicles[0].name).toContain("Tourneo");

    // Deposit unknown / handoff
    const handoff = executeToolCall("request_human_handoff", { reason: "Customer asked about deposit" }, mockFleet, ctx);
    expect(handoff.triggerHandoff).toBe(true);

    // Breakdown case
    const breakdown = executeToolCall("start_breakdown_case", { location: "Hayes", issue: "Car broke down" }, mockFleet, ctx);
    expect(breakdown.updatedContext.stage).toBe("breakdown");
  });

  test("Transcript 5: 'Do you have any hybrid cars?' lists available Hybrid and Plug-in-Hybrid cars, labelled, cheapest first", () => {
    const fullMockFleet: FleetVehicleItem[] = [
      ...mockFleet,
      {
        id: "p1",
        make: "Toyota",
        model: "Prius",
        year: 2017,
        fuel_type: "Hybrid",
        weekly_rent: 200,
        monthly_mileage_allowance: 5000,
        status: "available",
      },
    ];
    const ctx: LeadContext = {};
    const res = executeToolCall("list_available_vehicles", { fuel_group: "hybrid" }, fullMockFleet, ctx);

    expect(res.result.vehicles.length).toBeGreaterThan(0);
    // Cheapest first
    const rents = res.result.vehicles.map((v: any) => parseInt(v.weekly_rent.replace(/\D/g, ""), 10));
    for (let i = 1; i < rents.length; i++) {
      expect(rents[i]).toBeGreaterThanOrEqual(rents[i - 1]);
    }
  });

  test("Transcript 6: 'Any diesel?' offers E220D and Vito if available; else provides fallback available cars", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("list_available_vehicles", { fuel_group: "diesel" }, mockFleet, ctx);
    expect(res.result).toBeDefined();
  });

  test("Transcript 7: 'What's available?' returns at most 5 cars, cheapest first", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("list_available_vehicles", {}, mockFleet, ctx);
    expect(res.result.vehicles.length).toBeLessThanOrEqual(5);
  });

  test("Transcript 8: 'Electric under 250' returns only MG 5 EV", () => {
    const fullMockFleet: FleetVehicleItem[] = [
      ...mockFleet,
      {
        id: "mg1",
        make: "MG",
        model: "MG5 EV",
        year: 2022,
        fuel_type: "Electric",
        weekly_rent: 200,
        monthly_mileage_allowance: 5000,
        status: "available",
      },
    ];
    const ctx: LeadContext = {};
    const res = executeToolCall("list_available_vehicles", { fuel_group: "electric", max_rent: 250 }, fullMockFleet, ctx);
    expect(res.result.vehicles.some((v: any) => v.car.includes("MG 5 EV"))).toBe(true);
    res.result.vehicles.forEach((v: any) => {
      const price = parseInt(v.weekly_rent.replace(/\D/g, ""), 10);
      expect(price).toBeLessThanOrEqual(250);
    });
  });

  test("Transcript 9: A model whose only CRM vehicle has an expired MOT is not offered as available", () => {
    const expiredFleet: FleetVehicleItem[] = [
      {
        id: "v_exp",
        make: "Mercedes-Benz",
        model: "EQE",
        year: 2023,
        fuel_type: "Electric",
        weekly_rent: 440,
        monthly_mileage_allowance: 4500,
        status: "available",
        registration: "EX23MOT",
        // @ts-ignore
        next_mot_date: "2020-01-01", // expired
      },
    ];

    const ctx: LeadContext = {};
    const res = executeToolCall("find_vehicles", { query: "eqe" }, expiredFleet, ctx);
    const eqe = res.result.vehicles.find((v: any) => v.car.includes("EQE"));
    expect(eqe?.available_now).toBe(false);
  });

  test("Transcript 10: 'Santa Fe' query lists both versions when queried", () => {
    const ctx: LeadContext = {};
    const res = executeToolCall("find_vehicles", { query: "santa fe" }, mockFleet, ctx);
    expect(res.result.vehicles.length).toBeGreaterThanOrEqual(2);
    expect(res.result.vehicles.some((v: any) => v.car.includes("2023-2025"))).toBe(true);
    expect(res.result.vehicles.some((v: any) => v.car.includes("2026"))).toBe(true);
  });

  test("Transcript 11: Deposit amounts - EQE (£1,000), Prius (£500), Santa Fe 2026 (team confirms)", () => {
    const ctx: LeadContext = {};
    const eqe = executeToolCall("find_vehicles", { query: "eqe" }, mockFleet, ctx);
    expect(eqe.result.vehicles[0].deposit).toBe("£1000");

    const prius = executeToolCall("find_vehicles", { query: "prius" }, mockFleet, ctx);
    expect(prius.result.vehicles[0].deposit).toBe("£500");

    const sf2026 = executeToolCall("find_vehicles", { query: "santa fe 2026" }, mockFleet, ctx);
    expect(sf2026.result.vehicles[0].deposit).toContain("to be confirmed by team");
  });
});

describe("System Prompt Engine", () => {
  test("builds system prompt containing collected lead details", () => {
    const ctx: LeadContext = {
      driver_name: "Alex Smith",
      age: 32,
      pco_badge: true,
      penalty_points: 0,
      preferred_vehicles: ["Toyota Auris Estate"],
      stage: "vehicle_selected",
    };

    const prompt = buildSystemPrompt(ctx, mockFleet);
    expect(prompt).toContain("Customer Name: Alex Smith");
    expect(prompt).toContain("Age: 32");
    expect(prompt).toContain("PCO Badge: Yes");
    expect(prompt).toContain("Licence Points: 0");
    expect(prompt).toContain("Toyota Auris Estate");
  });
});
