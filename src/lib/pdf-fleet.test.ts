import { describe, expect, test } from "bun:test";
import { PDF_FLEET } from "@/lib/pdf-fleet";

describe("PDF Fleet Dataset Verification", () => {
  test("contains exactly 80 vehicles in total", () => {
    expect(PDF_FLEET.length).toBe(80);
  });

  test("contains exact requested count breakdown per make", () => {
    const counts: Record<string, number> = {
      Mercedes: 0,
      Toyota: 0,
      Tesla: 0,
      Jaguar: 0,
      Hyundai: 0,
      MG: 0,
      Ford: 0,
    };

    for (const vehicle of PDF_FLEET) {
      if (vehicle.displayName.includes("Mercedes")) {
        counts.Mercedes++;
      } else if (vehicle.displayName.includes("Toyota")) {
        counts.Toyota++;
      } else if (vehicle.displayName.includes("Tesla")) {
        counts.Tesla++;
      } else if (vehicle.displayName.includes("Jaguar")) {
        counts.Jaguar++;
      } else if (vehicle.displayName.includes("Hyundai")) {
        counts.Hyundai++;
      } else if (vehicle.displayName.includes("MG")) {
        counts.MG++;
      } else if (vehicle.displayName.includes("Ford")) {
        counts.Ford++;
      }
    }

    expect(counts).toEqual({
      Mercedes: 34,
      Toyota: 13,
      Tesla: 11,
      Jaguar: 2,
      Hyundai: 8,
      MG: 9,
      Ford: 3,
    });
  });

  test("all vehicles have required fields with exact format", () => {
    for (const vehicle of PDF_FLEET) {
      expect(vehicle.registration).toBeTruthy();
      expect(typeof vehicle.registration).toBe("string");
      expect(vehicle.registration).toMatch(/^[A-Z0-9]+$/);

      expect(vehicle.displayName).toBeTruthy();
      expect(typeof vehicle.displayName).toBe("string");

      expect(vehicle.fuelType).toBeTruthy();
      expect(["Electric", "Plug-in-Hybrid", "Diesel", "Petrol", "Hybrid"]).toContain(
        vehicle.fuelType,
      );

      expect(vehicle.year).toBeGreaterThan(2000);
      expect(vehicle.year).toBeLessThanOrEqual(new Date().getFullYear() + 1);
    }
  });
});
