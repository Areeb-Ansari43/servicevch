import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/integrations/supabase/config";

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
  odometer: number | null;
  confidence: "high" | "low" | "none";
  reason?: string;
};

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

  const apiKey = (
    getRuntimeEnv("GEMINI_API_KEY") ??
    getRuntimeEnv("GOOGLE_API_KEY") ??
    getRuntimeEnv("GOOGLE_GEMINI_API_KEY") ??
    getRuntimeEnv("VITE_GEMINI_API_KEY") ??
    ""
  ).trim();

  if (!apiKey) {
    return { ok: false, odometer: null, confidence: "none", reason: "gemini_api_key_missing" };
  }

  const promptText =
    "Examine this vehicle dashboard / odometer photograph. Extract the total accumulated main odometer mileage integer (in miles or kilometers). " +
    "IMPORTANT: Do NOT confuse the main odometer reading with trip meter numbers (e.g., Trip A, Trip B, 0.0, 12.4), digital clock, outside temperature, fuel range, or speedometer numbers. " +
    'Respond ONLY with a JSON object in this exact format: {"odometer": number | null, "confidence": "high" | "low" | "none"}. ' +
    'If the main odometer digits are blurry, partially cut off, ambiguous, or if there is any doubt between trip meter and main odometer, return odometer: null and confidence: "low".';

  const models = [
    (getRuntimeEnv("GEMINI_MODEL") ?? "gemini-2.5-flash").trim(),
    "gemini-2.0-flash",
  ];

  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inlineData: {
                    mimeType,
                    data: base64Data,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      });

      if (!response.ok) continue;

      const raw = await response.text();
      const data = JSON.parse(raw) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      if (
        parsed &&
        typeof parsed.odometer === "number" &&
        parsed.odometer > 0 &&
        parsed.confidence === "high"
      ) {
        return {
          ok: true,
          odometer: Math.round(parsed.odometer),
          confidence: "high",
        };
      } else {
        return {
          ok: true,
          odometer: null,
          confidence: "low",
          reason: "unclear_photo_or_low_confidence",
        };
      }
    } catch {
      // try next model
    }
  }

  return { ok: false, odometer: null, confidence: "none", reason: "ocr_failed" };
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
