import { describe, expect, it } from "bun:test";
import { serviceDue } from "./service-due";

describe("service due badges (sheet colours)", () => {
  it("red when past the service mileage (LM68 KRU 335,552 vs 328,000)", () => {
    expect(serviceDue({ current_mileage: 335552, next_service_mileage: 328000 })).toMatchObject({ state: "overdue", label: "Service overdue · 7,552 mi over" });
  });
  it("yellow within 1,500 miles (WD19 SNN 188,667 vs 190,000)", () => {
    expect(serviceDue({ current_mileage: 188667, next_service_mileage: 190000 })).toMatchObject({ state: "soon", label: "Service due soon · 1,333 mi left" });
  });
  it("fine further away; nothing when there is no service mileage or date (electric cars)", () => {
    expect(serviceDue({ current_mileage: 120024, next_service_mileage: 130000 })?.state).toBe("ok");
    expect(serviceDue({ current_mileage: 39076, next_service_mileage: null })).toBeNull();
  });
  it("uses the service date too", () => {
    const today = new Date("2026-11-24T12:00:00");
    expect(serviceDue({ next_service_date: "2026-11-30" }, today)?.state).toBe("soon");
    expect(serviceDue({ next_service_date: "2026-11-01" }, today)?.state).toBe("overdue");
  });
});
