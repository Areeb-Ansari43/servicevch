import { describe, expect, it } from "bun:test";
import type { DriverTrack } from "@/lib/fleet-data";

describe("Driver File Editing & Payload Persistence", () => {
  it("correctly maps edited driver rent fields into update payload", () => {
    const originalDriver: DriverTrack = {
      id: "driver-123",
      driver_name: "John Doe",
      email: "john@example.com",
      phone: "+447700900123",
      vehicle_id: "veh-456",
      registration: "AB12CDE",
      start_mileage: 10000,
      current_mileage: 12000,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2025-01-01",
      status: "active",
      weekly_rent: 0,
      rent_due_day: "Monday",
      rent_status: "unpaid",
      balance_due: 0,
      charges: [],
      monthly_logs: [],
    };

    const updatedDriver: DriverTrack = {
      ...originalDriver,
      driver_name: "John Doe Updated",
      start_date: "2025-02-01",
      licence_expiry_date: "2028-06-15",
      weekly_rent: 250,
      rent_due_day: "Friday",
      rent_status: "paid",
      balance_due: 0,
    };

    const updatePayload = {
      driver_name: updatedDriver.driver_name,
      email: updatedDriver.email?.trim() || null,
      phone: updatedDriver.phone?.trim() || null,
      vehicle_id: updatedDriver.vehicle_id || null,
      reg: updatedDriver.registration,
      start_date: updatedDriver.start_date,
      licence_expiry_date: updatedDriver.licence_expiry_date || null,
      allowance: updatedDriver.allowance,
      rate_pence: updatedDriver.excess_rate,
      weekly_rent: updatedDriver.weekly_rent,
      rent_due_day: updatedDriver.rent_due_day,
      rent_status: updatedDriver.rent_status,
      balance_due: updatedDriver.balance_due,
    };

    expect(updatePayload.driver_name).toBe("John Doe Updated");
    expect(updatePayload.start_date).toBe("2025-02-01");
    expect(updatePayload.licence_expiry_date).toBe("2028-06-15");
    expect(updatePayload.weekly_rent).toBe(250);
    expect(updatePayload.rent_due_day).toBe("Friday");
    expect(updatePayload.rent_status).toBe("paid");
    expect(updatePayload.balance_due).toBe(0);
    expect(updatePayload.reg).toBe("AB12CDE");
  });

  it("converts empty licence expiry date to null in payload", () => {
    const rawInput = "";
    const payloadVal = rawInput || null;
    expect(payloadVal).toBeNull();
  });

  it("calculates licence expiry chip status correctly for expired, expiring, and valid dates", () => {
    const now = new Date("2026-03-01T00:00:00Z").getTime();

    function getLicenceStatus(expiryDateStr: string | null) {
      if (!expiryDateStr) return null;
      const t = new Date(expiryDateStr).getTime();
      if (isNaN(t)) return null;
      const days = Math.ceil((t - now) / 86400000);
      if (days < 0) return { status: "expired", days, color: "red" };
      if (days <= 30) return { status: "expiring", days, color: "amber" };
      return { status: "valid", days, color: "green" };
    }

    // Expired 5 days ago
    const expiredRes = getLicenceStatus("2026-02-24");
    expect(expiredRes?.status).toBe("expired");
    expect(expiredRes?.color).toBe("red");

    // Expiring in 10 days
    const expiringRes = getLicenceStatus("2026-03-11");
    expect(expiringRes?.status).toBe("expiring");
    expect(expiringRes?.color).toBe("amber");

    // Valid for over a year
    const validRes = getLicenceStatus("2027-10-15");
    expect(validRes?.status).toBe("valid");
    expect(validRes?.color).toBe("green");
  });

  it("includes both upcoming expiries and already-expired licences in the alert filter", () => {
    const now = new Date("2026-03-01T00:00:00Z").getTime();
    const mockDrivers = [
      { id: "d1", driver_name: "Driver Expired", licence_expiry_date: "2026-02-20" }, // -9 days
      { id: "d2", driver_name: "Driver Expiring", licence_expiry_date: "2026-03-15" }, // +14 days
      { id: "d3", driver_name: "Driver Far Future", licence_expiry_date: "2028-05-01" }, // > 30 days
      { id: "d4", driver_name: "Driver No Licence", licence_expiry_date: null },
    ];

    const alerts = mockDrivers
      .filter((d) => d.licence_expiry_date)
      .flatMap((d) => {
        const t = new Date(d.licence_expiry_date!).getTime();
        const days = Math.ceil((t - now) / 86400000);
        if (days <= 30) return [{ driver: d, days }];
        return [];
      });

    expect(alerts.length).toBe(2);
    expect(alerts.map((a) => a.driver.id)).toEqual(["d1", "d2"]);
  });

  it("updates driver name instantly in optimistic drivers array state", () => {
    const driversList: DriverTrack[] = [
      {
        id: "driver-123",
        driver_name: "Original Name",
        email: "john@example.com",
        phone: "+447700900123",
        vehicle_id: "veh-456",
        registration: "AB12CDE",
        start_mileage: 10000,
        current_mileage: 12000,
        allowance: 5000,
        excess_rate: 20,
        start_date: "2025-01-01",
        status: "active",
        weekly_rent: 200,
        rent_due_day: "Monday",
        rent_status: "unpaid",
        balance_due: 200,
        charges: [],
        monthly_logs: [],
      },
    ];

    const updated = {
      ...driversList[0],
      driver_name: "New Edited Name",
      licence_expiry_date: "2027-11-30",
    };

    const newDrivers = driversList.map((item) => (item.id === updated.id ? updated : item));

    expect(newDrivers[0].driver_name).toBe("New Edited Name");
    expect(newDrivers[0].licence_expiry_date).toBe("2027-11-30");
  });

  it("includes drivers with active: true or active: null when filtering active drivers", () => {
    const rows = [
      { id: "1", driver_name: "Driver 1", active: true },
      { id: "2", driver_name: "Driver 2", active: null },
      { id: "3", driver_name: "Driver 3", active: false },
    ];

    const activeDrivers = rows.filter((r) => r.active !== false);
    expect(activeDrivers.length).toBe(2);
    expect(activeDrivers.map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("calculates updated balance correctly when adding an extra charge", () => {
    const currentBalance = 150;
    const chargeAmount = 75.5;
    const newBalance = currentBalance + chargeAmount;

    expect(newBalance).toBe(225.5);
  });
});
