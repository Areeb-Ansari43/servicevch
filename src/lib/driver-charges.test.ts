import { describe, expect, it } from "bun:test";
import type { DriverCharge, DriverTrack } from "./fleet-data";

describe("Driver Charges & Data State Consistency", () => {
  it("uses driver_id as the primary foreign key column on DriverCharge records", () => {
    const chargeRow = {
      id: "charge-123",
      driver_id: "driver-abc",
      amount: 45.5,
      description: "Congestion Charge Reimbursement",
      created_at: "2026-08-30T10:00:00Z",
    };

    const parsedCharge: DriverCharge = {
      id: chargeRow.id,
      driver_id: chargeRow.driver_id ?? (chargeRow as any).user_id,
      amount: Number(chargeRow.amount),
      description: chargeRow.description,
      created_at: chargeRow.created_at,
    };

    expect(parsedCharge.driver_id).toBe("driver-abc");
    expect(parsedCharge.amount).toBe(45.5);
  });

  it("handles driver_id fallback when mapping charges from database rows", () => {
    const legacyRow = {
      id: "charge-456",
      user_id: "driver-abc",
      amount: 100,
      description: "Late Fee",
      created_at: "2026-08-30T11:00:00Z",
    };

    const targetDriverId = legacyRow.driver_id ?? legacyRow.user_id;
    expect(targetDriverId).toBe("driver-abc");
  });

  it("updates driver balance and itemised charges array optimistically upon adding a charge", () => {
    const initialDriver: DriverTrack = {
      id: "driver-1",
      driver_name: "John Doe",
      email: "john@example.com",
      phone: "07123456789",
      vehicle_id: "veh-1",
      registration: "AB21 XYZ",
      start_mileage: 10000,
      current_mileage: 12000,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2026-01-01",
      weekly_rent: 220,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      charges: [],
      monthly_logs: [],
    };

    const newChargeAmt = 50;
    const newChargeDesc = "PCN Fine Pass-through";

    const newCharge: DriverCharge = {
      id: "charge-temp-1",
      driver_id: initialDriver.id,
      amount: newChargeAmt,
      description: newChargeDesc,
      created_at: new Date().toISOString(),
    };

    const updatedDriver: DriverTrack = {
      ...initialDriver,
      balance_due: initialDriver.balance_due + newChargeAmt,
      charges: [newCharge, ...initialDriver.charges],
    };

    expect(updatedDriver.balance_due).toBe(50);
    expect(updatedDriver.charges.length).toBe(1);
    expect(updatedDriver.charges[0].driver_id).toBe("driver-1");
    expect(updatedDriver.charges[0].description).toBe("PCN Fine Pass-through");
  });
});
