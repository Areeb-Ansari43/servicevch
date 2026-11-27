import { getRuntimeEnv } from "@/integrations/supabase/config";
import {
  assessLicenceRead,
  type LicenceReadResult,
  type RawLicenceRead,
} from "@/lib/driving-licence";

/**
 * Reads the front of a driving licence with Gemini vision and checks the result
 * (driving-licence.ts). Nothing is stored and the licence details are never logged.
 */
const PROMPT =
  "You are reading the FRONT of a driving licence (usually a UK DVLA photocard). Copy the printed text exactly; never guess.\n" +
  "UK photocard numbered fields: 1 = surname, 2 = first names, 3 = date and place of birth, 4a = issue date, 4b = EXPIRY date, 4c = issuing authority, 5 = licence number (16 characters, sometimes followed by a separate 2-digit issue number).\n" +
  "Rules: expiry_date is field 4b, never 4a or the date of birth. licence_number is field 5 without spaces and without the trailing 2-digit issue number. " +
  "Letters vs digits: in a UK number positions 1-5 are letters or 9, 6-11 are digits, 12-13 letters or 9, 14 is a digit, 15-16 letters; read O/0, I/1, S/5, B/8 accordingly.\n" +
  'Respond ONLY with JSON: {"is_driving_licence": boolean, "readable": boolean, "country": string|null, "surname": string|null, "first_names": string|null, ' +
  '"date_of_birth": "DD.MM.YYYY"|null, "expiry_date": "DD.MM.YYYY"|null, "licence_number": string|null}. ' +
  "Field 2 may start with a title (MR, MRS, MS, MISS, DR): leave the title out of first_names. " +
  "Copy field 5 character by character exactly as printed. Do NOT rewrite its digits as a date: in a UK number the 6 digits after the 5 surname letters are birth decade, month (+50 for women), day, then year digit, e.g. someone born 07.03.1986 has 803076 there, not 860307.\n" +
  "Use null for anything you cannot read with certainty. Set readable=false if the photo is blurred, cut off or has glare over these fields.";

const RECHECK_PROMPT =
  "Look only at the FRONT of this UK driving licence. Read field 5 (the licence number) and field 3 (date of birth).\n" +
  "Read field 5 one character at a time, left to right, exactly as printed. It has 16 characters: 5 letters from the surname (or 9s), " +
  "6 digits, 2 letters (initials or 9s), 1 digit, 2 letters. A 2-digit issue number may follow after a space: leave it out. " +
  "Do not reorder digits or turn them into a date. Watch for O/0, I/1, S/5, B/8, Z/2.\n" +
  'Respond ONLY with JSON: {"licence_number": string|null, "date_of_birth": "DD.MM.YYYY"|null}.';

export async function readDrivingLicence(dataUrl: string): Promise<LicenceReadResult> {
  const fail = (error: string): LicenceReadResult => ({
    ok: false,
    fullName: { value: null, confidence: "missing" },
    expiryDate: { value: null, confidence: "missing" },
    licenceNumber: { value: null, confidence: "missing" },
    dateOfBirth: null,
    warnings: [],
    error,
  });

  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) return fail("Please choose a photo (JPG, PNG, HEIC) or PDF of the licence.");
  const mimeType = m[1].toLowerCase();
  if (!/^(image\/(jpeg|jpg|png|webp|heic|heif)|application\/pdf)$/.test(mimeType)) {
    return fail("Please use a photo (JPG, PNG, HEIC) or a PDF of the licence.");
  }
  const base64 = m[2];
  const { geminiApiKey } = await import("@/lib/gemini-vision.server");
  const { azureConfig, readLicenceWithAzure } = await import("@/lib/azure-licence.server");
  const choice = (getRuntimeEnv("LICENCE_READER") ?? "auto").trim().toLowerCase();
  const useAzure = choice !== "gemini" && Boolean(azureConfig()) && !/webp/.test(mimeType);
  const useGemini = choice !== "azure" && Boolean(geminiApiKey());
  if (!useAzure && !useGemini)
    return fail(
      "Licence reading isn't set up yet (add the Azure or Gemini settings). Please type the details in.",
    );

  // Azure first when it's set up: a model trained on ID documents.
  let azureResult: LicenceReadResult | null = null;
  let azureReason = "";
  if (useAzure) {
    const az = await readLicenceWithAzure(mimeType, base64);
    if (az.ok) {
      azureResult = assessLicenceRead(az.raw);
      // Fields Azure itself was unsure about are marked "Check".
      const unsure: Record<string, keyof LicenceReadResult> = {
        FirstName: "fullName",
        LastName: "fullName",
        DocumentNumber: "licenceNumber",
        DateOfExpiration: "expiryDate",
      };
      for (const k of az.lowConfidence) {
        const fieldName = unsure[k] as "fullName" | "licenceNumber" | "expiryDate";
        const fld = azureResult[fieldName];
        if (fld.value && fld.confidence === "high") fld.confidence = "check";
      }
      if (az.lowConfidence.length)
        azureResult.warnings.push("Some details were hard to read. Please check the amber fields.");
      if (azureResult.ok && allClear(azureResult)) return azureResult;
    } else {
      azureReason = az.reason;
    }
  }

  if (useGemini) {
    const g = await readWithGemini(mimeType, base64);
    if ("result" in g) {
      // Both read it: keep whichever is surer.
      if (!azureResult || !azureResult.ok) return g.result;
      return score(g.result) > score(azureResult) ? g.result : azureResult;
    }
    if (azureResult?.ok) return azureResult;
    return fail(`The licence couldn't be read (${explain(g.reason)}). Please try again or type the details in.`);
  }
  if (azureResult?.ok) return azureResult;
  if (azureResult && !azureResult.ok) return azureResult;
  return fail(`The licence couldn't be read (${explain(azureReason)}). Please try again or type the details in.`);
}

const allClear = (r: LicenceReadResult) =>
  [r.fullName, r.expiryDate, r.licenceNumber].every((f) => f.confidence === "high");
const score = (r: LicenceReadResult) =>
  [r.fullName, r.expiryDate, r.licenceNumber].reduce(
    (n, f) => n + (f.confidence === "high" ? 2 : f.confidence === "check" ? 1 : 0),
    0,
  );

function explain(reason: string): string {
  if (reason === "timeout") return "the reader took too long";
  if (/429/.test(reason)) return "the reader is busy (too many requests)";
  if (/40[13]/.test(reason)) return "the reader's key was refused";
  if (/404/.test(reason)) return "the reader's address or model wasn't found";
  if (reason === "azure_unreachable") return "Azure couldn't be reached";
  return `reader error ${reason}`;
}

async function readWithGemini(
  mimeType: string,
  base64: string,
): Promise<{ result: LicenceReadResult } | { reason: string }> {
  const { geminiImageJson } = await import("@/lib/gemini-vision.server");
  const res = await geminiImageJson({ prompt: PROMPT, mimeType, base64, timeoutMs: 20000 });
  if (!res.ok) return { reason: res.reason };
  const first = assessLicenceRead(res.json as RawLicenceRead);
  if (first.licenceNumber.confidence === "high" || !first.ok) return { result: first };
  // The number didn't check out: one careful second look at just the number and date of birth.
  const again = await geminiImageJson({
    prompt: RECHECK_PROMPT,
    mimeType,
    base64,
    timeoutMs: 25000,
    thinking: true,
  });
  if (again.ok) {
    const merged = { ...(res.json as RawLicenceRead), ...(again.json as RawLicenceRead) };
    const second = assessLicenceRead(merged);
    if (second.licenceNumber.confidence === "high") return { result: second };
  }
  return { result: first };
}

