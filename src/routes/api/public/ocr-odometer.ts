import { createFileRoute } from "@tanstack/react-router";

/**
 * Public Gemini Vision OCR endpoint for vehicle odometer reading extraction.
 *
 * POST /api/public/ocr-odometer
 * Body: { photo_url?: string, photo_base64?: string, mime_type?: string }
 */
export const Route = createFileRoute("/api/public/ocr-odometer")({
  server: {
    handlers: {
      POST: async ({ request }) => handleOcr(request),
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "content-type",
          },
        }),
    },
  },
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export type OcrResult = {
  ok: boolean;
  /** Odometer in miles (converted when the display shows km). */
  odometer: number | null;
  /** high = clear read; low = a reading staff should check; none = nothing usable. */
  confidence: "high" | "low" | "none";
  unit?: "miles" | "km" | null;
  reason?: string;
};

const ODOMETER_PROMPT =
  "You are reading a car dashboard photo to find the TOTAL odometer (the car's lifetime distance).\n" +
  "How to find it: it is usually labelled ODO, often 5-6 digits, on the digital display or a mechanical counter. " +
  "Ignore trip meters (TRIP, A, B, often with a decimal like 123.4), range / distance to empty, the clock, outside temperature, speed, " +
  "fuel or battery percentage, and service-interval counters. If the odometer shows a tenths digit in a different colour or after a point, drop it.\n" +
  "Read every digit, including leading digits. Do not guess digits that are cut off or covered by glare.\n" +
  'Respond ONLY with JSON: {"odometer": integer|null, "unit": "miles"|"km"|null, "confidence": "high"|"medium"|"low", "reason": string}. ' +
  'Use "high" only when the ODO value is clearly visible and unambiguous; "medium" when it is readable but small or slightly unclear; ' +
  '"low" when you are unsure which number is the odometer or some digits are hard to read. Use null when there is no odometer in the photo.';

const KM_TO_MILES = 0.621371;

type RawRead = { odometer?: unknown; unit?: unknown; confidence?: unknown; reason?: unknown };

/** Turns the model's answer into a checked result (exported for tests). */
export function interpretOdometerRead(raw: RawRead): OcrResult {
  const n = typeof raw.odometer === "number" ? raw.odometer : Number(String(raw.odometer ?? "").replace(/[^0-9.]/g, ""));
  const unit = raw.unit === "km" ? "km" : raw.unit === "miles" ? "miles" : null;
  const reason = typeof raw.reason === "string" ? raw.reason.slice(0, 200) : undefined;
  if (!Number.isFinite(n) || n <= 0 || n > 2_000_000) {
    return { ok: true, odometer: null, confidence: "none", unit, reason: reason || "no_odometer_found" };
  }
  const miles = unit === "km" ? Math.round(n * KM_TO_MILES) : Math.round(n);
  const conf = raw.confidence === "high" || raw.confidence === "medium" ? "high" : "low";
  return {
    ok: true,
    odometer: miles,
    // A km display was converted: worth a quick look by staff.
    confidence: unit === "km" ? "low" : conf,
    unit,
    reason: unit === "km" ? `Display showed ${Math.round(n).toLocaleString("en-GB")} km; converted to miles.` : reason,
  };
}

export async function parseOdometerPhoto(
  photoUrlOrBase64: string,
  explicitMimeType?: string,
): Promise<OcrResult> {
  let base64Data = "";
  let mimeType = explicitMimeType || "image/jpeg";

  if (photoUrlOrBase64.startsWith("data:")) {
    const match = photoUrlOrBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }
  } else if (photoUrlOrBase64.startsWith("http://") || photoUrlOrBase64.startsWith("https://")) {
    try {
      const res = await fetch(photoUrlOrBase64);
      if (!res.ok) {
        return { ok: false, odometer: null, confidence: "none", reason: "failed_to_fetch_image" };
      }
      const fetchedType = res.headers.get("content-type");
      if (fetchedType) mimeType = fetchedType.split(";")[0];
      const buffer = await res.arrayBuffer();
      base64Data = Buffer.from(buffer).toString("base64");
    } catch {
      return { ok: false, odometer: null, confidence: "none", reason: "image_fetch_error" };
    }
  } else {
    base64Data = photoUrlOrBase64;
  }

  if (!base64Data) {
    return { ok: false, odometer: null, confidence: "none", reason: "empty_image_data" };
  }

  const { geminiImageJson, geminiApiKey } = await import("@/lib/gemini-vision.server");
  if (!geminiApiKey()) {
    return { ok: false, odometer: null, confidence: "none", reason: "gemini_api_key_missing" };
  }

  // First clear read wins; an unsure read is kept and the next model gets a chance to do better.
  const res = await geminiImageJson({
    prompt: ODOMETER_PROMPT,
    mimeType,
    base64: base64Data,
    timeoutMs: 20000,
    accept: (json) => {
      try {
        return interpretOdometerRead(json as RawRead).confidence === "high";
      } catch {
        return false;
      }
    },
  });
  if (!res.ok) return { ok: false, odometer: null, confidence: "none", reason: `ocr_failed_${res.reason}` };
  return interpretOdometerRead(res.json as RawRead);
}

async function handleOcr(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, odometer: null, confidence: "none", error: "Invalid JSON" }, 400);
  }

  const photoUrl = typeof body.photo_url === "string" ? body.photo_url.trim() : "";
  const photoBase64 = typeof body.photo_base64 === "string" ? body.photo_base64.trim() : "";
  const mimeType = typeof body.mime_type === "string" ? body.mime_type.trim() : "image/jpeg";

  const targetImage = photoUrl || photoBase64;
  if (!targetImage) {
    return jsonResponse(
      { ok: false, odometer: null, confidence: "none", error: "photo_url or photo_base64 is required" },
      400,
    );
  }

  const result = await parseOdometerPhoto(targetImage, mimeType);
  return jsonResponse(result);
}
