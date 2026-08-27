import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const scanSchema = z.object({
  imageBase64: z.string().min(100).max(12_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
});

const readField = (field: any) => String(field?.valueString ?? field?.valueNumber ?? field?.valueCountryRegion ?? field?.content ?? "").trim();
const readDate = (field: any) => String(field?.valueDate ?? field?.valueString ?? field?.content ?? "").trim();
const normalizeAddress = (value: string) => value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
const findPostcode = (value: string) => value.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0]?.toUpperCase() ?? "";

/** Azure Document Intelligence licence extraction. Azure secrets are server-only. */
export const scanDrivingLicence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value) => scanSchema.parse(value))
  .handler(async ({ data }) => {
    const endpoint = process.env.AZURE_DOCINTEL_ENDPOINT?.trim().replace(/\/$/, "");
    const key = process.env.AZURE_DOCINTEL_KEY?.trim();
    if (!endpoint || !key) throw new Error("Azure Document Intelligence is not configured on the server.");

    const bytes = Uint8Array.from(atob(data.imageBase64.replace(/^data:[^;]+;base64,/, "")), (char) => char.charCodeAt(0));
    const start = await fetch(`${endpoint}/documentModels/prebuilt-idDocument:analyze?api-version=2024-11-30`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": data.mimeType },
      body: bytes,
    });
    if (!start.ok) throw new Error(`Azure scan failed (${start.status}).`);
    const operation = start.headers.get("operation-location");
    if (!operation) throw new Error("Azure did not return a scan operation.");

    let result: any = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 + attempt * 150, 1000)));
      const poll = await fetch(operation, { headers: { "Ocp-Apim-Subscription-Key": key } });
      if (!poll.ok) throw new Error(`Azure scan polling failed (${poll.status}).`);
      const body = await poll.json() as any;
      if (body.status === "succeeded") { result = body; break; }
      if (body.status === "failed") throw new Error("Azure could not read this licence image.");
    }
    if (!result?.analyzeResult?.documents?.[0]) throw new Error("Azure scan timed out or found no licence document.");

    const fields = result.analyzeResult.documents[0].fields ?? {};
    const fullAddress = readField(fields.Address);
    const postcode = findPostcode(fullAddress);
    return {
      forename: readField(fields.FirstName).toUpperCase(),
      surname: readField(fields.LastName).toUpperCase(),
      fullName: `${readField(fields.FirstName)} ${readField(fields.LastName)}`.trim().toUpperCase(),
      dob: readDate(fields.DateOfBirth),
      expiry: readDate(fields.DateOfExpiration),
      licence: readField(fields.DocumentNumber).replace(/\s+/g, "").toUpperCase(),
      address: normalizeAddress(fullAddress.replace(postcode, "").trim()),
      postcode,
      rawFields: Object.fromEntries(Object.entries(fields).map(([name, field]: [string, any]) => [name, field?.valueString ?? field?.valueDate ?? field?.content ?? null])),
      confidence: Object.fromEntries(Object.entries(fields).map(([name, field]: [string, any]) => [name, field?.confidence ?? null])),
      reviewRequired: true,
    };
  });
