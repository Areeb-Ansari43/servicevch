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
  "Use null for anything you cannot read with certainty. Set readable=false if the photo is blurred, cut off or has glare over these fields.";

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
  const { geminiImageJson, geminiApiKey } = await import("@/lib/gemini-vision.server");
  if (!geminiApiKey())
    return fail(
      "Licence reading isn't set up yet (GEMINI_API_KEY is missing). Please type the details in.",
    );

  const res = await geminiImageJson({ prompt: PROMPT, mimeType, base64: m[2], timeoutMs: 20000 });
  if (res.ok) return assessLicenceRead(res.json as RawLicenceRead);
  const why =
    res.reason === "timeout"
      ? "the AI took too long"
      : res.reason === "http_429"
        ? "the AI is busy (too many requests)"
        : res.reason === "http_403" || res.reason === "http_401"
          ? "the AI key was refused"
          : res.reason === "http_404"
            ? "the AI model wasn't found"
            : `AI error ${res.reason}`;
  return fail(`The licence couldn't be read (${why}). Please try again or type the details in.`);
}
