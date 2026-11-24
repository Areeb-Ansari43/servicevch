import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { interpretOdometerRead, parseOdometerPhoto } from "@/routes/api/public/ocr-odometer";

describe("interpreting the AI's odometer read", () => {
  it("keeps a clear read", () => {
    expect(interpretOdometerRead({ odometer: 41250, unit: "miles", confidence: "high" })).toMatchObject({ odometer: 41250, confidence: "high" });
    expect(interpretOdometerRead({ odometer: 41250, unit: "miles", confidence: "medium" }).confidence).toBe("high");
  });
  it("keeps an unsure read for staff to check instead of throwing it away", () => {
    expect(interpretOdometerRead({ odometer: 41250, confidence: "low", reason: "glare" })).toMatchObject({ odometer: 41250, confidence: "low", reason: "glare" });
  });
  it("converts km to miles and asks for a check", () => {
    const r = interpretOdometerRead({ odometer: 100000, unit: "km", confidence: "high" });
    expect(r.odometer).toBe(62137);
    expect(r.confidence).toBe("low");
    expect(r.reason).toMatch(/100,000 km/);
  });
  it("rejects nonsense", () => {
    expect(interpretOdometerRead({ odometer: null }).odometer).toBeNull();
    expect(interpretOdometerRead({ odometer: 0 }).odometer).toBeNull();
    expect(interpretOdometerRead({ odometer: 99_999_999 }).odometer).toBeNull();
    expect(interpretOdometerRead({ odometer: "41,250" }).odometer).toBe(41250);
  });
});

describe("reader (Gemini faked)", () => {
  const original = globalThis.fetch;
  const img = "data:image/jpeg;base64," + btoa("jpeg");
  const reply = (o: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o) }] } }] }));
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
  });
  afterEach(() => {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  });
  it("asks the second model when the first is unsure, and uses its clear read", async () => {
    let n = 0;
    globalThis.fetch = mock(async () => (++n === 1 ? reply({ odometer: 41256, confidence: "low" }) : reply({ odometer: 41250, confidence: "high" }))) as any;
    const r = await parseOdometerPhoto(img);
    expect(n).toBe(2);
    expect(r).toMatchObject({ odometer: 41250, confidence: "high" });
  });
  it("returns the unsure read when no model is sure", async () => {
    globalThis.fetch = mock(async () => reply({ odometer: 41256, confidence: "low" })) as any;
    expect(await parseOdometerPhoto(img)).toMatchObject({ odometer: 41256, confidence: "low" });
  });
  it("stops at the first clear read", async () => {
    let n = 0;
    globalThis.fetch = mock(async () => (n++, reply({ odometer: 12000, confidence: "high" }))) as any;
    await parseOdometerPhoto(img);
    expect(n).toBe(1);
  });
});
