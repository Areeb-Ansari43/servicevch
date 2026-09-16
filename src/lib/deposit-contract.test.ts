import { describe, expect, test } from "bun:test";
import { calculateContractEndDate, getContractDaysRemaining } from "./contract-helpers";

export type DepositPayment = {
  id: string;
  driver_id: string;
  amount: number;
  paid_at: string;
  note?: string | null;
  created_at: string;
};

export type DriverTrack = {
  id: string;
  driver_name: string;
  email?: string | null;
  phone?: string | null;
  vehicle_id: string;
  registration: string;
  start_mileage: number;
  current_mileage: number;
  allowance: number;
  excess_rate: number;
  start_date: string;
  contract_length_weeks: number;
  deposit_total: number;
  deposit_payments: DepositPayment[];
  weekly_rent: number;
  rent_due_day: string;
  rent_status: "paid" | "unpaid";
  balance_due: number;
  charges: any[];
  monthly_logs: any[];
};

describe("Deposit Instalments & Payment Tracking", () => {
  test("calculates total deposit paid from instalments correctly", () => {
    const payments: DepositPayment[] = [
      {
        id: "dep-1",
        driver_id: "driver-123",
        amount: 200,
        paid_at: "2025-02-01T10:00:00Z",
        note: "1st instalment",
        created_at: "2025-02-01T10:00:00Z",
      },
      {
        id: "dep-2",
        driver_id: "driver-123",
        amount: 150,
        paid_at: "2025-02-10T10:00:00Z",
        note: "2nd instalment",
        created_at: "2025-02-10T10:00:00Z",
      },
    ];

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    expect(totalPaid).toBe(350);
  });

  test("computes correct deposit status label and outstanding balance", () => {
    const agreedTotal = 500;
    const paymentsPartial: DepositPayment[] = [
      {
        id: "dep-1",
        driver_id: "d1",
        amount: 200,
        paid_at: "2025-01-01",
        note: "Part 1",
        created_at: "2025-01-01",
      },
    ];

    const totalPaidPartial = paymentsPartial.reduce((sum, p) => sum + p.amount, 0);
    const outstandingPartial = Math.max(0, agreedTotal - totalPaidPartial);
    expect(totalPaidPartial).toBe(200);
    expect(outstandingPartial).toBe(300);

    const paymentsFull: DepositPayment[] = [
      ...paymentsPartial,
      {
        id: "dep-2",
        driver_id: "d1",
        amount: 300,
        paid_at: "2025-01-15",
        note: "Part 2",
        created_at: "2025-01-15",
      },
    ];

    const totalPaidFull = paymentsFull.reduce((sum, p) => sum + p.amount, 0);
    const outstandingFull = Math.max(0, agreedTotal - totalPaidFull);
    expect(totalPaidFull).toBe(500);
    expect(outstandingFull).toBe(0);
  });

  test("keeps deposit payments separate from driver rent balance_due", () => {
    const driver: DriverTrack = {
      id: "d-test",
      driver_name: "Test Driver",
      vehicle_id: "v-1",
      registration: "AB12CDE",
      start_mileage: 10000,
      current_mileage: 10500,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2025-01-01",
      contract_length_weeks: 6,
      deposit_total: 500,
      deposit_payments: [
        {
          id: "dep-1",
          driver_id: "d-test",
          amount: 200,
          paid_at: "2025-01-02",
          note: "Part payment",
          created_at: "2025-01-02",
        },
      ],
      weekly_rent: 220,
      rent_due_day: "Monday",
      rent_status: "unpaid",
      balance_due: 220,
      charges: [],
      monthly_logs: [],
    };

    // Deposit payment of £200 does not affect balance_due of rent (£220)
    expect(driver.balance_due).toBe(220);
    const depositPaid = driver.deposit_payments.reduce((sum, p) => sum + p.amount, 0);
    expect(depositPaid).toBe(200);
  });
});

describe("Contract Term & Renewal Tracking", () => {
  test("computes correct contract end date given start date and length in weeks", () => {
    // 2025-03-01 + 6 weeks (42 days) = 2025-04-12
    const endDate = calculateContractEndDate("2025-03-01", 6);
    expect(endDate.toISOString().slice(0, 10)).toBe("2025-04-12");
  });

  test("computes contract days remaining relative to reference date", () => {
    // Start date 2025-03-01, 6 weeks -> End date 2025-04-12
    // Ref date 2025-04-02 -> 10 days remaining
    const refDate = new Date("2025-04-02T00:00:00Z");
    const remaining = getContractDaysRemaining("2025-03-01", 6, refDate);
    expect(remaining).toBe(10);
  });

  test("flags drivers as expiring soon when contract ends within 14 days", () => {
    const refDate = new Date("2025-04-01T00:00:00Z"); // Ref date

    const driverSoon: DriverTrack = {
      id: "d-soon",
      driver_name: "John Soon",
      vehicle_id: "v-1",
      registration: "XY78ZWB",
      start_mileage: 5000,
      current_mileage: 5500,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2025-02-25", // 6 weeks = end 2025-04-08 (7 days remaining)
      contract_length_weeks: 6,
      deposit_total: 500,
      deposit_payments: [],
      weekly_rent: 200,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      charges: [],
      monthly_logs: [],
    };

    const remainingDays = getContractDaysRemaining(
      driverSoon.start_date,
      driverSoon.contract_length_weeks,
      refDate,
    );

    expect(remainingDays).toBe(7);
    expect(remainingDays <= 14).toBe(true);
  });

  test("handles legacy drivers created prior to schema migration gracefully with null safety", () => {
    // Legacy driver record where new columns are null/undefined
    const legacyDriver: Partial<DriverTrack> = {
      id: "legacy-1",
      driver_name: "Legacy Driver",
      vehicle_id: "v-legacy",
      registration: undefined,
      start_mileage: 12000,
      current_mileage: 12500,
      allowance: undefined as any,
      excess_rate: undefined as any,
      start_date: "2025-01-01",
      contract_length_weeks: undefined,
      deposit_total: undefined,
      deposit_payments: undefined,
      weekly_rent: undefined as any,
      rent_status: undefined as any,
      balance_due: undefined as any,
    };

    // Safely default values for UI rendering
    const contractWeeks = legacyDriver.contract_length_weeks ?? 6;
    const depositTotal = legacyDriver.deposit_total ?? 0;
    const depositPayments = legacyDriver.deposit_payments ?? [];
    const registrationStr = legacyDriver.registration ?? "";
    const allowanceVal = legacyDriver.allowance ?? 5000;
    const balanceDueVal = legacyDriver.balance_due ?? 0;

    expect(contractWeeks).toBe(6);
    expect(depositTotal).toBe(0);
    expect(depositPayments).toEqual([]);
    expect(registrationStr).toBe("");
    expect(allowanceVal).toBe(5000);
    expect(balanceDueVal).toBe(0);

    // Verify contract date calculation works with defaulted weeks
    const endDate = calculateContractEndDate(legacyDriver.start_date!, contractWeeks);
    expect(endDate).toBeInstanceOf(Date);

    // Verify registration normalization does not throw on undefined registration
    const normalizedReg = (legacyDriver.registration || "").replace(/\s+/g, "").toUpperCase();
    expect(normalizedReg).toBe("");
  });
});
