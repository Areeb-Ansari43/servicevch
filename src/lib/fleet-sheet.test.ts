import { describe, expect, it } from "bun:test";
import { EXCESS_RATE_PENCE, FLEET_SHEET, carTermsFor, normaliseReg } from "./fleet-sheet";

describe("fleet price sheet", () => {
  it("has all 92 cars once, with tidy regs", () => {
    expect(FLEET_SHEET).toHaveLength(92);
    expect(new Set(FLEET_SHEET.map((c) => c.reg)).size).toBe(92);
    expect(FLEET_SHEET.every((c) => c.reg === normaliseReg(c.reg))).toBe(true);
    expect(FLEET_SHEET.find((c) => c.reg === "SF19WPW")).toBeTruthy(); // "SF19 WPW" on the sheet
  });

  it("uses each car's own rent (Sheet 1), the model's allowance (Sheet 2) and 20p a mile", () => {
    expect(
      carTermsFor({ registration: "sf19 wpw", make: "Mercedes-Benz", model: "Vito" }),
    ).toMatchObject({
      weeklyRent: 400,
      monthlyAllowance: 5000,
      excessRatePence: 20,
      source: "sheet",
    });
    expect(carTermsFor({ registration: "WR16UED" }).weeklyRent).toBe(350);
    expect(carTermsFor({ registration: "MD25AYY" }).weeklyRent).toBe(430);
    expect(carTermsFor({ registration: "HK73SXU" }).weeklyRent).toBe(370); // fixed on the new sheet
    expect(carTermsFor({ registration: "OW19XNX" }).weeklyRent).toBe(270); // was OWN19XNX
    // EQE: Sheet 1 says 4,000 on most rows, Sheet 2 (the allowance list) says 4,500
    expect(carTermsFor({ registration: "KN73XLA" }).monthlyAllowance).toBe(4500);
    expect(EXCESS_RATE_PENCE).toBe(20);
  });

  it("falls back to the CRM price, then the model's Sheet 2 terms, for cars not on the sheet", () => {
    expect(
      carTermsFor({
        registration: "XX99XXX",
        make: "MERCEDES-BENZ",
        model: "E 220 D SE",
        weekly_price: 299,
      }),
    ).toMatchObject({
      weeklyRent: 299,
      monthlyAllowance: 5000,
      source: "crm",
    });
    expect(
      carTermsFor({ registration: "XX99XXX", make: "Mercedes-Benz", model: "EQE 300" }),
    ).toMatchObject({
      weeklyRent: 440,
      monthlyAllowance: 4500,
      source: "model",
    });
    expect(carTermsFor({ registration: "XX99XXX", make: "Odd", model: "Car" })).toMatchObject({
      weeklyRent: null,
      excessRatePence: 20,
    });
  });
});
