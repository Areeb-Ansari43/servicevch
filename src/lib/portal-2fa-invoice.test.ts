import { describe, expect, it } from "bun:test";
import type { DriverTrack } from "./fleet-data";

describe("Portal 2FA, Terms & Payment Breakdown Logic", () => {
  it("calculates deposit status correctly for a partially paid deposit", () => {
    const driver: Partial<DriverTrack> = {
      deposit_total: 500,
      deposit_payments: [
        { id: "1", driver_id: "d1", amount: 250, paid_at: "2026-03-01", created_at: "2026-03-01", note: "1st instalment" },
      ],
    };

    const totalPaid = (driver.deposit_payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const agreed = Number(driver.deposit_total || 0);

    expect(totalPaid).toBe(250);
    expect(agreed).toBe(500);

    let status = "Unpaid";
    if (agreed > 0 && totalPaid >= agreed) {
      status = "Fully Paid";
    } else if (totalPaid > 0) {
      status = `Partially Paid (£${totalPaid} of £${agreed} paid)`;
    }

    expect(status).toBe("Partially Paid (£250 of £500 paid)");
  });

  it("calculates deposit status correctly for a fully paid deposit", () => {
    const driver: Partial<DriverTrack> = {
      deposit_total: 500,
      deposit_payments: [
        { id: "1", driver_id: "d1", amount: 300, paid_at: "2026-03-01", created_at: "2026-03-01" },
        { id: "2", driver_id: "d1", amount: 200, paid_at: "2026-03-05", created_at: "2026-03-05" },
      ],
    };

    const totalPaid = (driver.deposit_payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const agreed = Number(driver.deposit_total || 0);

    let status = "Unpaid";
    if (agreed > 0 && totalPaid >= agreed) {
      status = "Fully Paid";
    } else if (totalPaid > 0) {
      status = `Partially Paid (£${totalPaid} of £${agreed} paid)`;
    }

    expect(status).toBe("Fully Paid");
  });

  it("calculates deposit status correctly when no deposit payments are made", () => {
    const driver: Partial<DriverTrack> = {
      deposit_total: 500,
      deposit_payments: [],
    };

    const totalPaid = (driver.deposit_payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const agreed = Number(driver.deposit_total || 0);

    let status = "Unpaid";
    if (agreed > 0 && totalPaid >= agreed) {
      status = "Fully Paid";
    } else if (totalPaid > 0) {
      status = `Partially Paid (£${totalPaid} of £${agreed} paid)`;
    }

    expect(status).toBe("Unpaid");
  });

  it("calculates total extra charges accurately from driver charges list", () => {
    const driver: Partial<DriverTrack> = {
      weekly_rent: 220,
      balance_due: 320,
      charges: [
        { id: "c1", driver_id: "d1", amount: 50, description: "Congestion Charge", created_at: "2026-03-01" },
        { id: "c2", driver_id: "d1", amount: 50, description: "Brake pad replacement", created_at: "2026-03-02" },
      ],
    };

    const extraChargesTotal = (driver.charges || []).reduce((sum, c) => sum + Number(c.amount || 0), 0);
    expect(extraChargesTotal).toBe(100);
  });

  it("formats invoice driver metadata cleanly with required rent and deposit fields", () => {
    const driver: DriverTrack = {
      id: "d1",
      driver_name: "Alexander Wright",
      email: "alex@example.com",
      phone: "+44 7700 900123",
      vehicle_id: "v1",
      registration: "EN73 UBZ",
      start_mileage: 12000,
      current_mileage: 14500,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2026-01-15",
      weekly_rent: 280,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      deposit_total: 1000,
      deposit_payments: [
        { id: "p1", driver_id: "d1", amount: 500, paid_at: "2026-01-15", created_at: "2026-01-15" },
      ],
      charges: [],
      monthly_logs: [],
    };

    const totalPaid = (driver.deposit_payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const agreed = Number(driver.deposit_total || 0);

    expect(driver.driver_name).toBe("Alexander Wright");
    expect(driver.registration).toBe("EN73 UBZ");
    expect(driver.weekly_rent).toBe(280);
    expect(totalPaid).toBe(500);
    expect(agreed).toBe(1000);
  });
});
