import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRuntimeEnv } from "@/integrations/supabase/config";

const scanSchema = z.object({
  imageBase64: z.string().min(100).max(12_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
});

const valueOf = (field: any) => field?.valueString ?? field?.valueNumber ?? field?.valueCountryRegion ?? field?.valueAddress?.streetAddress ?? field?.content ?? "";
const readField = (field: any) => String(valueOf(field)).trim();
const readDate = (field: any) => String(field?.valueDate ?? field?.valueString ?? field?.content ?? "").trim();
const normalizeAddress = (value: string) => value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
const findPostcode = (value: string) => value.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0]?.toUpperCase() ?? "";
const fieldByName = (fields: Record<string, any>, ...names: string[]) => {
  const wanted = names.map((name) => name.toLowerCase());
  const entry = Object.entries(fields).find(([name]) => wanted.includes(name.toLowerCase()));
  return entry?.[1];
};
const firstLineMatch = (content: string, pattern: RegExp) => content.split(/\r?\n/).map((line) => line.trim()).find((line) => pattern.test(line))?.replace(/^\d+[.)]\s*/, "").trim() ?? "";

/** Azure Document Intelligence licence extraction. Azure secrets are server-only. */
export const scanDrivingLicence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => scanSchema.parse(value))
  .handler(async ({ data }) => {
    const endpoint = getRuntimeEnv("AZURE_DOCINTEL_ENDPOINT")?.trim().replace(/\/$/, "");
    const key = getRuntimeEnv("AZURE_DOCINTEL_KEY")?.trim();
    if (!endpoint || !key) throw new Error("Azure Document Intelligence is not configured on the server.");

    const bytes = Uint8Array.from(atob(data.imageBase64.replace(/^data:[^;]+;base64,/, "")), (char) => char.charCodeAt(0));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    let start: Response;
    try {
      start = await fetch(`${endpoint}/documentModels/prebuilt-idDocument:analyze?api-version=2024-11-30`, {
        method: "POST",
        headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": data.mimeType },
        body: bytes,
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error(error instanceof Error && error.name === "AbortError" ? "Azure licence scan timed out after 20 seconds." : `Azure licence request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      clearTimeout(timeout);
    }
    if (!start.ok) throw new Error(`Azure scan failed (${start.status}).`);
    const operation = start.headers.get("operation-location");
    if (!operation) throw new Error("Azure did not return a scan operation.");

    let result: any = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(150 + attempt * 75, 500)));
      const poll = await fetch(operation, { headers: { "Ocp-Apim-Subscription-Key": key } });
      if (!poll.ok) throw new Error(`Azure scan polling failed (${poll.status}).`);
      const body = await poll.json() as any;
      if (body.status === "succeeded") { result = body; break; }
      if (body.status === "failed") throw new Error("Azure could not read this licence image.");
    }
    if (!result?.analyzeResult?.documents?.[0]) throw new Error("Azure scan timed out or found no licence document.");

    const fields = result.analyzeResult.documents[0].fields ?? {};
    const ocrContent = String(result.analyzeResult.content ?? "");
    const firstName = readField(fieldByName(fields, "FirstName", "GivenName", "FirstNames")) || firstLineMatch(ocrContent, /^1[.)]\s*[A-Z]/i);
    const lastName = readField(fieldByName(fields, "LastName", "Surname", "FamilyName")) || firstLineMatch(ocrContent, /^2[.)]\s*[A-Z]/i);
    const fullAddress = readField(fieldByName(fields, "Address", "AddressLine", "FullAddress")) || firstLineMatch(ocrContent, /\b(?:street|road|avenue|lane|close|drive|way|court|gardens?)\b/i);
    const postcode = findPostcode(fullAddress || ocrContent);
    const licence = readField(fieldByName(fields, "DocumentNumber", "LicenceNumber", "LicenseNumber")) || firstLineMatch(ocrContent, /^5[.)]/i);
    const dob = readDate(fieldByName(fields, "DateOfBirth", "BirthDate")) || firstLineMatch(ocrContent, /^3[.)]/i);
    const expiry = readDate(fieldByName(fields, "DateOfExpiration", "ExpiryDate", "DateOfExpiry")) || firstLineMatch(ocrContent, /^4[.)]/i);
    return {
      forename: firstName.toUpperCase(),
      surname: lastName.toUpperCase(),
      fullName: `${firstName} ${lastName}`.trim().toUpperCase(),
      dob,
      expiry,
      licence: licence.replace(/\s+/g, "").toUpperCase(),
      address: normalizeAddress(fullAddress.replace(postcode, "").trim()),
      postcode,
      rawFields: Object.fromEntries(Object.entries(fields).map(([name, field]: [string, any]) => [name, valueOf(field) || null])),
      confidence: Object.fromEntries(Object.entries(fields).map(([name, field]: [string, any]) => [name, field?.confidence ?? null])),
      reviewRequired: true,
    };
  });
