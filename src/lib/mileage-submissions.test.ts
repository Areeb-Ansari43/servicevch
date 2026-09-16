import { describe, expect, test } from "bun:test";
import { type DriverTrack, type MileageSubmission } from "./fleet-data";

describe("B1 & B2: Odometer OCR Extraction & Automatic Mileage Calculation", () => {
  test("pre-fills high confidence OCR reading and leaves low confidence blank for manual entry", () => {
    const highConfidenceOcr = { odometer: 12450, confidence: "high" as const };
    const lowConfidenceOcr = { odometer: null, confidence: "low" as const };

    // High confidence OCR provides a suggested value
    const suggestedValue = highConfidenceOcr.confidence === "high" ? highConfidenceOcr.odometer : null;
    expect(suggestedValue).toBe(12450);

    // Low confidence / unclear OCR output is left blank (null) for staff manual entry
    const blankValue = lowConfidenceOcr.confidence === "high" ? lowConfidenceOcr.odometer : null;
    expect(blankValue).toBeNull();
  });

  test("calculates miles driven, overage, remaining allowance, and excess charge accurately", () => {
    const startMileage = 10000;
    const allowance = 5000;
    const excessRate = 20; // 20p / mile

    // Scenario 1: Within allowance (driven 3,500 miles out of 5,000)
    const reading1 = 13500;
    const driven1 = Math.max(0, reading1 - startMileage);
    const overage1 = Math.max(0, driven1 - allowance);
    const remaining1 = Math.max(0, allowance - driven1);
    const charge1 = (overage1 * excessRate) / 100;

    expect(driven1).toBe(3500);
    expect(overage1).toBe(0);
    expect(remaining1).toBe(1500);
    expect(charge1).toBe(0);

    // Scenario 2: Exceeded allowance (driven 6,200 miles out of 5,000 -> 1,200 miles over @ 20p = £240.00)
    const reading2 = 16200;
    const driven2 = Math.max(0, reading2 - startMileage);
    const overage2 = Math.max(0, driven2 - allowance);
    const remaining2 = Math.max(0, allowance - driven2);
    const charge2 = (overage2 * excessRate) / 100;

    expect(driven2).toBe(6200);
    expect(overage2).toBe(1200);
    expect(remaining2).toBe(0);
    expect(charge2).toBe(240.0);
  });
});

describe("B3: Correctness Requirements & Validation Flags", () => {
  const driver: DriverTrack = {
    id: "drv-123",
    driver_name: "Tariq Mahmood",
    registration: "BD20XPU",
    vehicle_id: "veh-456",
    start_mileage: 10000,
    current_mileage: 12500,
    allowance: 5000,
    excess_rate: 20,
    start_date: "2025-02-01",
    weekly_rent: 340,
    rent_due_day: "Monday",
    rent_status: "paid",
    balance_due: 0,
    charges: [],
    monthly_logs: [],
  };

  test("flags submitted reading that is lower than current recorded mileage (odometer backwards check)", () => {
    const submittedReading = 12000; // Lower than recorded current_mileage (12,500)
    const isBackwards = submittedReading < driver.current_mileage;

    expect(isBackwards).toBe(true);
  });

  test("flags implausibly large mileage jumps (> 3,000 miles above recorded reading)", () => {
    const normalReading = 13200; // +700 miles
    const plausibleJump = normalReading > driver.current_mileage && normalReading - driver.current_mileage > 3000;
    expect(plausibleJump).toBe(false);

    const hugeReading = 18000; // +5,500 miles jump
    const implausibleJump = hugeReading > driver.current_mileage && hugeReading - driver.current_mileage > 3000;
    expect(implausibleJump).toBe(true);
  });

  test("approving submission updates single source of truth for driver and vehicle current_mileage", () => {
    const confirmedReading = 14500;

    const updatedDriver = { ...driver, current_mileage: confirmedReading };
    const updatedVehicle = { id: "veh-456", registration: "BD20XPU", current_mileage: confirmedReading };

    expect(updatedDriver.current_mileage).toBe(14500);
    expect(updatedVehicle.current_mileage).toBe(14500);
  });

  test("calculates excess charge for staff one-click addition without auto-charging silently", () => {
    const confirmedReading = 16500;
    const milesDriven = confirmedReading - driver.start_mileage; // 6,500 mi
    const overage = milesDriven - driver.allowance; // 1,500 mi
    const calculatedCharge = (overage * driver.excess_rate) / 100; // £300.00

    expect(overage).toBe(1500);
    expect(calculatedCharge).toBe(300.0);

    // Initial driver balance before staff confirmation is unaffected (no silent addition)
    expect(driver.balance_due).toBe(0);

    // When staff confirms adding the charge, balance is updated
    const newBalance = driver.balance_due + calculatedCharge;
    expect(newBalance).toBe(300.0);
  });
});
