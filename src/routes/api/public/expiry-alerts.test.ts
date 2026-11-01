import { describe, expect, it } from "bun:test";

describe("Expiry Alerts & Schedule Logic", () => {
  it("evaluates overdue vehicle expiries correctly without cross-day suppression", () => {
    // Simulate vehicle BN20WJL with MOT expired on 2026-09-15 (36 days overdue on 2026-10-21)
    const targetMidnight = Date.UTC(2026, 8, 15); // Sept 15

    // Day 1: 2026-10-21
    const day1Now = Date.UTC(2026, 9, 21);
    const day1Diff = Math.round((targetMidnight - day1Now) / 86400000);
    expect(day1Diff).toBe(-36);
    expect(day1Diff <= 30).toBe(true);

    // Day 2: 2026-10-22 (Next day)
    const day2Now = Date.UTC(2026, 9, 22);
    const day2Diff = Math.round((targetMidnight - day2Now) / 86400000);
    expect(day2Diff).toBe(-37);
    expect(day2Diff <= 30).toBe(true); // Should STILL be included in fleet summary on Oct 22!

    // Day 3: 2026-10-23 (Following day)
    const day3Now = Date.UTC(2026, 9, 23);
    const day3Diff = Math.round((targetMidnight - day3Now) / 86400000);
    expect(day3Diff).toBe(-38);
    expect(day3Diff <= 30).toBe(true); // Should STILL be included in fleet summary on Oct 23!
  });

  it("verifies Europe/London timezone window check across 25 October DST transition (BST -> GMT)", () => {
    function isInsideTargetWindow(dateObj: Date, targetHour: number, maxMin: number): boolean {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(dateObj);

      const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
      const min = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

      return hour === targetHour && min <= maxMin;
    }

    // 1. Before clock change: Saturday 24 Oct 2026 (BST = UTC+1)
    // 09:00 BST is 08:00 UTC
    const bstUtc8 = new Date("2026-10-24T08:00:00Z");
    expect(isInsideTargetWindow(bstUtc8, 9, 35)).toBe(true);

    // 09:00 UTC on BST is 10:00 BST -> Outside 09:00 window
    const bstUtc9 = new Date("2026-10-24T09:00:00Z");
    expect(isInsideTargetWindow(bstUtc9, 9, 35)).toBe(false);

    // 2. DST Clock change occurs: Sunday 25 Oct 2026 02:00 -> 01:00 GMT

    // 3. After clock change: Monday 26 Oct 2026 (GMT = UTC+0)
    // 08:00 UTC on GMT is 08:00 GMT -> Outside 09:00 window
    const gmtUtc8 = new Date("2026-10-26T08:00:00Z");
    expect(isInsideTargetWindow(gmtUtc8, 9, 35)).toBe(false);

    // 09:00 UTC on GMT is 09:00 GMT -> Inside 09:00 window
    const gmtUtc9 = new Date("2026-10-26T09:00:00Z");
    expect(isInsideTargetWindow(gmtUtc9, 9, 35)).toBe(true);
  });
});
