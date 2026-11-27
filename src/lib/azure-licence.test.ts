import { afterEach, describe, expect, it } from "bun:test";
import { mapAzureResult, readLicenceWithAzure } from "./azure-licence.server";
import { readDrivingLicence } from "./licence-reader.server";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ["AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT", "AZURE_DOCUMENT_INTELLIGENCE_KEY", "GEMINI_API_KEY", "LICENCE_READER"])
    delete process.env[k];
});

const field = (v: Record<string, unknown>, confidence = 0.98) => ({ ...v, confidence });
const azureDone = (fields: Record<string, unknown>) => ({
  status: "succeeded",
  analyzeResult: { documents: [{ docType: "idDocument.driverLicense", fields }] },
});
const peter = {
  FirstName: field({ valueString: "PETER ZOLTAN" }),
  LastName: field({ valueString: "FARSANG" }),
  DocumentNumber: field({ valueString: "FARSA803076PZ8SP" }),
  DateOfBirth: field({ valueDate: "1986-03-07" }),
  DateOfExpiration: field({ valueDate: "2028-01-04" }),
  CountryRegion: field({ valueCountryRegion: "GBR" }),
};

function fakeAzure(result: unknown, seen: { headers?: Headers; url?: string; body?: any }[] = []) {
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    seen.push({ url, headers: new Headers(init.headers), body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (init.method === "POST")
      return new Response(null, { status: 202, headers: { "operation-location": "https://x.cognitiveservices.azure.com/op/1" } });
    return new Response(JSON.stringify(result), { status: 200 });
  }) as any;
}

describe("Azure licence reader", () => {
  it("maps Azure's ID fields to the licence checks", () => {
    const r = mapAzureResult(azureDone(peter));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.raw.surname).toBe("FARSANG");
      expect(r.raw.expiry_date).toBe("04.01.2028");
      expect(r.raw.date_of_birth).toBe("07.03.1986");
      expect(r.lowConfidence).toEqual([]);
    }
  });

  it("sends the photo to the prebuilt ID model with the key header, then reads the result", async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://x.cognitiveservices.azure.com/";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = "test-key";
    const seen: any[] = [];
    fakeAzure(azureDone(peter), seen);
    const r = await readLicenceWithAzure("image/jpeg", "QUJD");
    expect(r.ok).toBe(true);
    expect(seen[0].url).toBe(
      "https://x.cognitiveservices.azure.com/documentintelligence/documentModels/prebuilt-idDocument:analyze?api-version=2024-11-30",
    );
    expect(seen[0].headers.get("Ocp-Apim-Subscription-Key")).toBe("test-key");
    expect(seen[0].body).toEqual({ base64Source: "QUJD" });
  });

  it("the CRM uses Azure when set up: full name without title, checked number", async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://x.cognitiveservices.azure.com";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = "test-key";
    fakeAzure(azureDone({ ...peter, FirstName: field({ valueString: "MR PETER ZOLTAN" }) }));
    const r = await readDrivingLicence("data:image/jpeg;base64,QUJD");
    expect(r.ok).toBe(true);
    expect(r.fullName).toEqual({ value: "Peter Zoltan Farsang", confidence: "high" });
    expect(r.licenceNumber).toEqual({ value: "FARSA803076PZ8SP", confidence: "high" });
    expect(r.expiryDate.value).toBe("2028-01-04");
  });

  it("fields Azure is unsure about are marked Check", async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://x.cognitiveservices.azure.com";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = "test-key";
    fakeAzure(azureDone({ ...peter, DocumentNumber: field({ valueString: "FARSA803076PZ8SP" }, 0.4) }));
    const r = await readDrivingLicence("data:image/jpeg;base64,QUJD");
    expect(r.licenceNumber.confidence).toBe("check");
  });

  it("a wrong key is explained", async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = "https://x.cognitiveservices.azure.com";
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = "bad";
    globalThis.fetch = (async () => new Response('{"error":{"code":"401"}}', { status: 401 })) as any;
    const r = await readDrivingLicence("data:image/jpeg;base64,QUJD");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/key was refused/);
  });
});
