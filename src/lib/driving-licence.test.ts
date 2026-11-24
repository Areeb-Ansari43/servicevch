import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  assessLicenceRead,
  birthDateFromNumber,
  normaliseLicenceNumber,
  parseLicenceDate,
  surnameCode,
  validateGbLicenceNumber,
} from "./driving-licence";
import { readDrivingLicence } from "./licence-reader.server";

// The DVLA's published specimen photocard: Sarah Meredith Morgan, born 11.03.1976,
// licence number MORGA753116SM9IJ (issue number 35 printed after it).
const specimen = {
  is_driving_licence: true,
  readable: true,
  country: "UK",
  surname: "MORGAN",
  first_names: "SARAH MEREDITH",
  date_of_birth: "11.03.1976",
  expiry_date: "08.12.2030",
  licence_number: "MORGA 753116 SM9IJ 35",
};

describe("licence number rules", () => {
  it("drops spaces and the trailing issue number", () => {
    expect(normaliseLicenceNumber("MORGA 753116 SM9IJ 35")).toBe("MORGA753116SM9IJ");
    expect(normaliseLicenceNumber("morga753116sm9ij35")).toBe("MORGA753116SM9IJ");
    expect(normaliseLicenceNumber("MORGA753116SM9IJ")).toBe("MORGA753116SM9IJ");
  });
  it("encodes surnames like the DVLA", () => {
    expect(surnameCode("Morgan")).toBe("MORGA");
    expect(surnameCode("Li")).toBe("LI999");
    expect(surnameCode("MacDonald")).toBe("MCDON");
    expect(surnameCode("O'Neil")).toBe("ONEIL");
  });
  it("decodes the date of birth (women: month + 50)", () => {
    expect(birthDateFromNumber("MORGA753116SM9IJ")).toBe("1976-03-11");
  });
  it("checks format, surname and birth date", () => {
    expect(
      validateGbLicenceNumber("MORGA753116SM9IJ", { surname: "Morgan", dateOfBirth: "1976-03-11" }),
    ).toEqual({
      formatOk: true,
      surnameMatches: true,
      birthMatches: true,
    });
    expect(validateGbLicenceNumber("MORGA753116SM9IJ", { surname: "Smith" }).surnameMatches).toBe(
      false,
    );
    expect(validateGbLicenceNumber("MORGA75311", {}).formatOk).toBe(false);
  });
});

describe("dates", () => {
  it.each([
    ["08.12.2030", "2030-12-08"],
    ["08/12/30", "2030-12-08"],
    ["2030-12-08", "2030-12-08"],
    ["31.02.2030", null],
    ["", null],
  ] as [string, string | null][])("%p -> %p", (raw: string, want: string | null) => {
    expect(parseLicenceDate(raw)).toBe(want);
  });
});

describe("assessing a read", () => {
  it("the specimen fills all three fields with high confidence", () => {
    const r = assessLicenceRead(specimen, "2026-11-23");
    expect(r.ok).toBe(true);
    expect(r.fullName).toEqual({ value: "Sarah Meredith Morgan", confidence: "high" });
    expect(r.expiryDate).toEqual({ value: "2030-12-08", confidence: "high" });
    expect(r.licenceNumber).toEqual({ value: "MORGA753116SM9IJ", confidence: "high" });
    expect(r.warnings).toEqual([]);
  });
  it("flags a misread number (0 read as O) instead of trusting it", () => {
    const r = assessLicenceRead({ ...specimen, licence_number: "MORGA7531O6SM9IJ" }, "2026-11-23");
    expect(r.licenceNumber.confidence).toBe("check");
    expect(r.warnings.join(" ")).toMatch(/16-character/);
  });
  it("flags a number that belongs to someone else", () => {
    const r = assessLicenceRead({ ...specimen, surname: "SMITH" }, "2026-11-23");
    expect(r.licenceNumber.confidence).toBe("check");
    expect(r.warnings.join(" ")).toMatch(/doesn't match the surname/);
  });
  it("warns when the licence has expired", () => {
    const r = assessLicenceRead({ ...specimen, expiry_date: "01.01.2025" }, "2026-11-23");
    expect(r.expiryDate).toEqual({ value: "2025-01-01", confidence: "check" });
    expect(r.warnings.join(" ")).toMatch(/expired on 01\/01\/2025/);
  });
  it("refuses something that isn't a driving licence", () => {
    const r = assessLicenceRead({ is_driving_licence: false });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/doesn't look like a driving licence/);
  });
});

describe("reader (Gemini faked)", () => {
  const original = globalThis.fetch;
  const img = "data:image/jpeg;base64," + btoa("jpeg");
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test";
  });
  afterEach(() => {
    globalThis.fetch = original;
    delete process.env.GEMINI_API_KEY;
  });
  it("sends the image and returns the checked result", async () => {
    let sentBody: any = null;
    globalThis.fetch = mock(async (_u: any, init: any) => {
      sentBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(specimen) }] } }],
        }),
      );
    }) as any;
    const r = await readDrivingLicence(img);
    expect(sentBody.contents[0].parts[1].inlineData.mimeType).toBe("image/jpeg");
    expect(sentBody.generationConfig.temperature).toBe(0);
    expect(sentBody.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 }); // fast: no thinking
    expect(r.licenceNumber.value).toBe("MORGA753116SM9IJ");
  });
  it("tries the second model when the first fails", async () => {
    let calls = 0;
    globalThis.fetch = mock(async () => {
      calls++;
      if (calls === 1) return new Response("busy", { status: 503 });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify(specimen) }] } }],
        }),
      );
    }) as any;
    const r = await readDrivingLicence(img);
    expect(calls).toBe(2);
    expect(r.ok).toBe(true);
  });
  it("explains clearly when the AI key is missing or the file type is wrong", async () => {
    delete process.env.GEMINI_API_KEY;
    expect((await readDrivingLicence(img)).error).toMatch(/GEMINI_API_KEY/);
    expect((await readDrivingLicence("data:text/plain;base64,aGk=")).error).toMatch(/photo/);
  });
});
