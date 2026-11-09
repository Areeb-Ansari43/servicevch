import { describe, expect, it } from "bun:test";
import { executeToolCall, type FleetVehicleItem } from "./ai-agent";
import { DEFAULT_BOT_CATALOG } from "./bot-catalog";

// A staff-edited catalogue: Prius price changed in Settings > Bot Fleet Catalogue.
const catalog = DEFAULT_BOT_CATALOG.map((c) => (c.display_name === "Toyota Prius" ? { ...c, weekly_rent: 215, deposit: 600 } : c));

const fleet: FleetVehicleItem[] = [
  { id: "1", make: "Toyota", model: "Prius", year: 2017, fuel_type: "Hybrid", weekly_rent: 999, monthly_mileage_allowance: 2500, status: "available", registration: "PR17AAA" },
  { id: "2", make: "Jaguar", model: "I-Pace", year: 2020, fuel_type: "Electric", weekly_rent: 999, monthly_mileage_allowance: 2500, status: "available", registration: "GX70UBD", next_mot_date: "2020-01-01" },
];

describe("WhatsApp bot quotes prices from the Settings catalogue", () => {
  for (const tool of ["find_vehicles", "get_vehicle", "compare_vehicles"]) {
    it(`${tool} uses the catalogue price, not the CRM/default price`, () => {
      const args = tool === "find_vehicles" ? { query: "prius" } : tool === "get_vehicle" ? { vehicle_name: "prius" } : { vehicle_names: ["prius"] };
      const { result } = executeToolCall(tool, args, fleet, {}, catalog);
      const text = JSON.stringify(result);
      expect(text).toContain("£215/week");
      expect(text).toContain("£600");
      expect(text).not.toContain("999");
    });
  }

  it("get_fleet lists only available cars with catalogue prices", () => {
    const { result } = executeToolCall("get_fleet", {}, fleet, {}, catalog);
    const text = JSON.stringify(result);
    expect(text).toContain("£215/week");
    expect(text).not.toContain("999");
    // Jaguar's MOT expired, so it must not be offered as available
    expect(text).not.toMatch(/"car":"Jaguar I-Pace"/);
  });
});
