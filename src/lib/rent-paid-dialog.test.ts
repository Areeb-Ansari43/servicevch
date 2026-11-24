import { describe, expect, it } from "bun:test";
import { previewPayment } from "@/components/rent-paid-dialog";

const base = { owed: 200, weekly: 200, anchorDue: "2026-11-23", advance: false, totalPaid: 200, depositAgreed: 500, depositPaidSoFar: 0, depositNow: 0 };

describe("Paid pop-up maths", () => {
  it("plain Paid: balance £0", () => {
    expect(previewPayment(base)).toMatchObject({ weeksAhead: 0, credit: 0, balanceAfter: 0 });
  });
  it("£600 paid on £200 a week: this week + 2 weeks ahead, next due in 3 weeks", () => {
    expect(previewPayment({ ...base, advance: true, totalPaid: 600 })).toMatchObject({ weeksAhead: 2, credit: 0, nextDue: "2026-12-14" });
  });
  it("a part-week becomes credit", () => {
    expect(previewPayment({ ...base, advance: true, totalPaid: 350 })).toMatchObject({ weeksAhead: 0, credit: 150, balanceAfter: -150 });
  });
  it("deposit paid with rent: shows what is still to pay, £0 when it clears it", () => {
    expect(previewPayment({ ...base, depositPaidSoFar: 200, depositNow: 300 }).depositLeft).toBe(0);
    expect(previewPayment({ ...base, depositNow: 300 }).depositLeft).toBe(200);
  });
});
