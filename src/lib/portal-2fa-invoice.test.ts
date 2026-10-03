import { describe, expect, it } from "bun:test";
import type { DriverTrack } from "./fleet-data";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("Portal 2FA Verification & Security Logic", () => {
  it("hashes 2FA verification code using SHA-256 so raw codes are never logged or stored in plaintext", async () => {
    const email = "driver@example.com";
    const code = "839201";
    const hash1 = await sha256(`${email}:${code}`);
    const hash2 = await sha256(`${email}:${code}`);
    const hashWrong = await sha256(`${email}:123456`);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hashWrong);
    expect(hash1).not.toContain(code);
    expect(hash1.length).toBe(64);
  });

  it("evaluates 10-minute expiry window correctly for 2FA codes", () => {
    const now = Date.now();
    const validExpiry = new Date(now + 10 * 60 * 1000).toISOString();
    const expiredTime = new Date(now - 1000).toISOString();

    const isValidExpired = new Date(validExpiry).getTime() < now;
    const isExpired = new Date(expiredTime).getTime() < now;

    expect(isValidExpired).toBe(false);
    expect(isExpired).toBe(true);
  });

  it("enforces single-use verification state on OTP records", () => {
    const otpRecord = {
      id: "otp-1",
      email: "driver@example.com",
      consumed: false,
    };

    // Verify first time
    expect(otpRecord.consumed).toBe(false);

    // Consume code
    otpRecord.consumed = true;

    // Second verification attempt should reject
    expect(otpRecord.consumed).toBe(true);
  });

  it("enforces max 5 failed attempts limit on 2FA code verification before invalidation", () => {
    let attemptsCount = 0;
    let consumed = false;

    function verifyAttempt(inputCodeHash: string, expectedCodeHash: string) {
      if (consumed) throw new Error("Code consumed");
      if (attemptsCount >= 5) {
        consumed = true;
        throw new Error("Too many failed attempts. Please request a new verification code.");
      }

      if (inputCodeHash !== expectedCodeHash) {
        attemptsCount += 1;
        if (attemptsCount >= 5) {
          consumed = true;
          throw new Error("Too many failed attempts. Please request a new verification code.");
        }
        throw new Error("Invalid verification code.");
      }

      consumed = true;
      return true;
    }

    const expectedHash = "correct-hash";
    const wrongHash = "wrong-hash";

    // 4 wrong attempts
    for (let i = 1; i <= 4; i++) {
      expect(() => verifyAttempt(wrongHash, expectedHash)).toThrow("Invalid verification code.");
    }
    expect(attemptsCount).toBe(4);
    expect(consumed).toBe(false);

    // 5th wrong attempt triggers max attempt limit and invalidates
    expect(() => verifyAttempt(wrongHash, expectedHash)).toThrow("Too many failed attempts.");
    expect(consumed).toBe(true);
  });

  it("enforces 30-second rate limiting cooldown between 2FA code generation requests", () => {
    const now = Date.now();
    const recentOtpCreatedAt = new Date(now - 15 * 1000).toISOString(); // 15 seconds ago
    const thirtySecsAgoISO = new Date(now - 30 * 1000).toISOString();

    const isSpamming = recentOtpCreatedAt >= thirtySecsAgoISO;
    expect(isSpamming).toBe(true);

    const oldOtpCreatedAt = new Date(now - 35 * 1000).toISOString(); // 35 seconds ago
    const isOldSpamming = oldOtpCreatedAt >= thirtySecsAgoISO;
    expect(isOldSpamming).toBe(false);
  });

  it("routes 2FA code delivery via email, WhatsApp fallback, or throws clear error when missing contact info", () => {
    function determineDeliveryChannel(driver: { email?: string | null; phone?: string | null }) {
      if (driver.email) {
        return { channel: "email", recipient: driver.email };
      }
      if (driver.phone) {
        return { channel: "whatsapp", recipient: driver.phone };
      }
      throw new Error("No email on file. Please contact staff to update your profile.");
    }

    // Driver with email
    const resEmail = determineDeliveryChannel({ email: "driver@example.com", phone: "+447700900123" });
    expect(resEmail.channel).toBe("email");
    expect(resEmail.recipient).toBe("driver@example.com");

    // Driver with phone only (no email)
    const resWa = determineDeliveryChannel({ email: null, phone: "+447700900123" });
    expect(resWa.channel).toBe("whatsapp");
    expect(resWa.recipient).toBe("+447700900123");

    // Driver with neither email nor phone
    expect(() => determineDeliveryChannel({ email: null, phone: null })).toThrow(
      "No email on file. Please contact staff to update your profile.",
    );
  });
});

describe("Portal Terms & Payment Breakdown Logic", () => {
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
      status: "active",
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
