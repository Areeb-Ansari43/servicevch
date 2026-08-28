import { expect, test, describe } from "bun:test";
import {
  parseCarEligibility,
  isAvailable,
  uniqueAvailableVehicles,
  normalizeModelKey,
  availableYears,
  isOutsideUKBusinessHours,
  getWelcomeMenuText,
} from "./agent-webhook";

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
    expect(isAvailable({ reg: "A1", make: "Mercedes", model: "E20", year: 2022, fuel_type: "Petrol", status: "available", next_mot_date: null, pco_expiry_date: null })).toBe(true);
    expect(isAvailable({ reg: "A2", make: "Mercedes", model: "E20", year: 2022, fuel_type: "Petrol", status: "Active", next_mot_date: null, pco_expiry_date: null })).toBe(true);
    expect(isAvailable({ reg: "A3", make: "Mercedes", model: "E20", year: 2022, fuel_type: "Petrol", status: "rented", next_mot_date: null, pco_expiry_date: null })).toBe(false);
    expect(isAvailable({ reg: "A4", make: "Mercedes", model: "E20", year: 2022, fuel_type: "Petrol", status: "In Service", next_mot_date: null, pco_expiry_date: null })).toBe(false);
    expect(isAvailable({ reg: "A5", make: "Mercedes", model: "E20", year: 2022, fuel_type: "Petrol", status: "off_road", next_mot_date: null, pco_expiry_date: null })).toBe(false);
  });

  test("uniqueAvailableVehicles deduplicates identical or slightly varied models (e.g., E20 vs E-20)", () => {
    const fleet = [
      { reg: "A1", make: "Mercedes", model: "E20", year: 2021, fuel_type: "Hybrid", status: "available", next_mot_date: null, pco_expiry_date: null },
      { reg: "A2", make: "Mercedes", model: "E-20", year: 2022, fuel_type: "Hybrid", status: "available", next_mot_date: null, pco_expiry_date: null },
      { reg: "A3", make: "Mercedes", model: "E20", year: 2023, fuel_type: "Hybrid", status: "rented", next_mot_date: null, pco_expiry_date: null },
      { reg: "B1", make: "Toyota", model: "Prius", year: 2020, fuel_type: "Hybrid", status: "rented", next_mot_date: null, pco_expiry_date: null },
    ];

    const unique = uniqueAvailableVehicles(fleet);
    expect(unique.length).toBe(1);
    expect(unique[0].make).toBe("Mercedes");
    expect(unique[0].model).toBe("E20");

    const years = availableYears(fleet, unique[0]);
    expect(years).toBe("2021, 2022");
  });
});
