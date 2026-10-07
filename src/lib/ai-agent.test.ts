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
