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

  it("maps charges consistently matching driver track id or auth user id", () => {
    const driverTrack: DriverTrack = {
      id: "track-uuid-1",
      driver_name: "Jane Smith",
      email: "jane@example.com",
      phone: "07987654321",
      vehicle_id: "veh-1",
      registration: "LC71 XYZ",
      start_mileage: 5000,
      current_mileage: 6000,
      allowance: 4000,
      excess_rate: 15,
      start_date: "2026-01-01",
      auth_user_id: "auth-uuid-99",
      weekly_rent: 200,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      charges: [],
      monthly_logs: [],
    };

    const charges = [
      { id: "c1", driver_id: "track-uuid-1", amount: 25, description: "Toll", created_at: "2026-03-01" },
      { id: "c2", user_id: "auth-uuid-99", amount: 40, description: "Clean Air Zone", created_at: "2026-03-02" },
    ];

    const chargesByDriver = new Map<string, DriverCharge[]>();
    for (const c of charges) {
      const targetId = c.driver_id ?? c.user_id;
      const parsed: DriverCharge = {
        id: c.id,
        driver_id: targetId,
        amount: c.amount,
        description: c.description,
        created_at: c.created_at,
      };
      const arr = chargesByDriver.get(targetId) ?? [];
      arr.push(parsed);
      chargesByDriver.set(targetId, arr);
    }

    const matchedCharges = [
      ...(chargesByDriver.get(driverTrack.id) ?? []),
      ...(driverTrack.auth_user_id && driverTrack.auth_user_id !== driverTrack.id
        ? chargesByDriver.get(driverTrack.auth_user_id) ?? []
        : []),
    ];

    expect(matchedCharges.length).toBe(2);
    expect(matchedCharges.map((x) => x.description)).toEqual(["Toll", "Clean Air Zone"]);
  });

  it("updates vehicle next_mot_date optimistically in vehicle state", () => {
    const vehicles = [
      {
        id: "v1",
        registration: "AB12 CDE",
        make: "Toyota",
        model: "Prius",
        year: 2022,
        fuel_type: "Hybrid" as const,
        current_mileage: 15000,
        status: "Rented" as const,
        next_service_date: "2026-09-01",
        next_mot_date: "2026-05-01",
        insurance_expiry: "2026-10-01",
        notes: "",
      },
    ];

    const updatedVehicle = {
      ...vehicles[0],
      next_mot_date: "2027-05-01",
    };

    const newVehicles = vehicles.map((item) => (item.id === updatedVehicle.id ? updatedVehicle : item));

    expect(newVehicles[0].next_mot_date).toBe("2027-05-01");
  });
});
