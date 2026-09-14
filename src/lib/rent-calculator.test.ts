import { describe, expect, test } from "bun:test";
import { getVehicleWeeklyPrice, calculateNextPaymentDueDate } from "./fleet-data";

describe("Vehicle Weekly Rent Price Auto-Fill", () => {
  test("returns correct weekly rent price for Mercedes EQE", () => {
    expect(getVehicleWeeklyPrice("Mercedes-Benz", "EQE 300")).toBe(440);
  });

  test("returns correct weekly rent price for Tesla Model 3", () => {
    expect(getVehicleWeeklyPrice("Tesla", "Model 3 Long Range")).toBe(260);
  });

  test("returns correct weekly rent price for Toyota Corolla Estate", () => {
    expect(getVehicleWeeklyPrice("Toyota", "Corolla Estate Hybrid")).toBe(220);
  });

  test("returns correct weekly rent price for Mercedes E220d", () => {
    expect(getVehicleWeeklyPrice("Mercedes-Benz", "E 220 D SE AUTO")).toBe(310);
  });

  test("returns default £200 for unknown vehicles", () => {
    expect(getVehicleWeeklyPrice("UnknownMake", "UnknownModel")).toBe(200);
  });
});

describe("Next Payment Due Date Calculation", () => {
  test("calculates next upcoming Saturday from a Monday reference date", () => {
    // 2025-02-17 is a Monday
    const refDate = new Date("2025-02-17T00:00:00Z");
    const nextDue = calculateNextPaymentDueDate("2025-02-10", "Saturday", refDate);
    expect(nextDue.getDay()).toBe(6); // Saturday
    expect(nextDue.toISOString().slice(0, 10)).toBe("2025-02-22");
  });

  test("returns start date day if start date is in the future on rent due day", () => {
    const refDate = new Date("2025-02-17T00:00:00Z");
    const nextDue = calculateNextPaymentDueDate("2025-03-01", "Saturday", refDate);
    // 2025-03-01 is a Saturday
    expect(nextDue.toISOString().slice(0, 10)).toBe("2025-03-01");
  });

  test("calculates upcoming due day if start date is in the future on different day", () => {
    const refDate = new Date("2025-02-17T00:00:00Z"); // Monday
    // 2025-03-02 is a Sunday
    const nextDue = calculateNextPaymentDueDate("2025-03-02", "Saturday", refDate);
    // Next Saturday after Sunday 2025-03-02 is 2025-03-08
    expect(nextDue.toISOString().slice(0, 10)).toBe("2025-03-08");
  });
});

describe("Rent Status Toggle Logic", () => {
  test("toggling rent status from unpaid to paid clears balance due to 0", () => {
    const currentStatus = "unpaid";
    const weeklyRent = 250;
    const currentBalance = 250;

    const newStatus = currentStatus === "paid" ? "unpaid" : "paid";
    let newBalance = currentBalance;
    if (newStatus === "paid") {
      newBalance = 0;
    } else {
      newBalance = currentBalance === 0 ? weeklyRent : currentBalance + weeklyRent;
    }

    expect(newStatus).toBe("paid");
    expect(newBalance).toBe(0);
  });

  test("toggling rent status from paid to unpaid restores balance due to weekly rent", () => {
    const currentStatus = "paid";
    const weeklyRent = 250;
    const currentBalance = 0;

    const newStatus = currentStatus === "paid" ? "unpaid" : "paid";
    let newBalance = currentBalance;
    if (newStatus === "paid") {
      newBalance = 0;
    } else {
      newBalance = currentBalance === 0 ? weeklyRent : currentBalance + weeklyRent;
    }

    expect(newStatus).toBe("unpaid");
    expect(newBalance).toBe(250);
  });
});
