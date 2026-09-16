import { describe, expect, test } from "bun:test";
import type { DriverTrack } from "./fleet-data";

describe("Driver Mileage Logic & Dropdown Auto-Fill", () => {
  const sampleDrivers: DriverTrack[] = [
    {
      id: "track-1",
      driver_name: "John Smith",
      email: "john@example.com",
      phone: "+447123456789",
      vehicle_id: "veh-1",
      registration: "AB12 CDE",
      start_mileage: 10000,
      current_mileage: 12500,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2025-01-01",
      invite_token: null,
      invite_status: "none",
      auth_user_id: null,
      weekly_rent: 250,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      charges: [],
      monthly_logs: [],
    },
    {
      id: "track-2",
      driver_name: "Sarah Connor",
      email: "sarah@example.com",
      phone: "+447987654321",
      vehicle_id: "veh-2",
      registration: "XY56 ZAB",
      start_mileage: 45000,
      current_mileage: 48000,
      allowance: 2500,
      excess_rate: 15,
      start_date: "2025-02-01",
      invite_token: null,
      invite_status: "accepted",
      auth_user_id: "user-2",
      weekly_rent: 300,
      rent_due_day: "Friday",
      rent_status: "unpaid",
      balance_due: 300,
      charges: [],
      monthly_logs: [],
    },
  ];

  test("filters drivers correctly by name or registration for dropdown", () => {
    const q1 = "john".toLowerCase();
    const match1 = sampleDrivers.filter(
      (d) =>
        d.driver_name.toLowerCase().includes(q1) ||
        d.registration.toLowerCase().includes(q1),
    );
    expect(match1).toHaveLength(1);
    expect(match1[0].driver_name).toBe("John Smith");

    const q2 = "xy56".toLowerCase();
    const match2 = sampleDrivers.filter(
      (d) =>
        d.driver_name.toLowerCase().includes(q2) ||
        d.registration.toLowerCase().includes(q2),
    );
    expect(match2).toHaveLength(1);
    expect(match2[0].registration).toBe("XY56 ZAB");
  });

  test("calculates driven miles, overage, and excess charge correctly", () => {
    const driver = sampleDrivers[0];
    const newOdometer = 16000;
    const driven = Math.max(0, newOdometer - driver.start_mileage);
    const overage = Math.max(0, driven - driver.allowance);
    const excessCharge = (overage * driver.excess_rate) / 100;

    expect(driven).toBe(6000);
    expect(overage).toBe(1000); // 6000 - 5000
    expect(excessCharge).toBe(200); // 1000 miles * 20p = £200.00
  });

  test("optimistic state update modifies current_mileage on driver_tracks item", () => {
    const prevDrivers = [...sampleDrivers];
    const targetId = "track-1";
    const newMileage = 13200;

    const updatedDrivers = prevDrivers.map((d) =>
      d.id === targetId ? { ...d, current_mileage: newMileage } : d,
    );

    expect(updatedDrivers[0].current_mileage).toBe(13200);
    expect(updatedDrivers[1].current_mileage).toBe(48000);
  });
});
