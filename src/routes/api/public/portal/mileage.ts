import { createFileRoute } from "@tanstack/react-router";

/**
 * Driver portal odometer submission (called by the website's /api/portal/mileage proxy).
 *
 * Body: { reading: number, photo_base64: "data:image/jpeg;base64,..." }
 *
 * 1. Identifies the driver from their portal session (X-Driver-Token).
 * 2. Stores the photo in the "mileage-photos" bucket with the service role.
 * 3. Runs the AI odometer reader (same as the CRM's own upload form).
 * 4. Inserts a pending mileage_submissions row with everything the CRM review screen
 *    needs. Realtime makes it appear in the CRM straight away.
 * 5. Emails admin@fa-ibi.co.uk (high importance, from notifications@) and posts to Telegram.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const BUCKET = "mileage-photos";

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl || "");
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1].toLowerCase(), bytes };
}

async function handle(request: Request): Promise<Response> {
  const { resolvePortalDriver } = await import("@/lib/portal-driver.server");
  const { jsonResponse } = await import("@/lib/portal-secret.server");
  const resolved = await resolvePortalDriver(request);
  if (!resolved.ok) return resolved.response;
  const { driver, user } = resolved.value;

  let body: { reading?: unknown; photo_base64?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "invalid_input", error: "Invalid request." }, 400);
  }

  const reading = Math.round(Number(body.reading));
  if (!Number.isFinite(reading) || reading <= 0 || reading > 2_000_000) {
    return jsonResponse({ ok: false, code: "invalid_reading", error: "Please enter a valid mileage reading." }, 400);
  }
  const photo = typeof body.photo_base64 === "string" ? decodeDataUrl(body.photo_base64) : null;
  if (!photo) {
    return jsonResponse({ ok: false, code: "invalid_photo", error: "Please attach a photo of your odometer." }, 400);
  }
  if (photo.bytes.length > MAX_BYTES) {
    return jsonResponse({ ok: false, code: "photo_too_large", error: "Photo is too large. Please try again." }, 413);
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  // 1. Store the photo
  const ext = photo.mime.includes("png") ? "png" : photo.mime.includes("webp") ? "webp" : "jpg";
  const path = `${driver.id}/${Date.now()}.${ext}`;
  const upload = () => db.storage.from(BUCKET).upload(path, photo.bytes, { contentType: photo.mime, upsert: false });
  let { error: upErr } = await upload();
  if (upErr && /bucket.*not.*found|not found/i.test(upErr.message || "")) {
    try {
      await db.storage.createBucket(BUCKET, { public: true });
    } catch {
      // bucket may already exist / no permission; the retry below reports the real error
    }
    ({ error: upErr } = await upload());
  }
  if (upErr) {
    console.error("[portal-mileage] photo upload failed:", upErr.message);
    return jsonResponse({ ok: false, code: "upload_failed", error: "Could not upload your photo. Please try again." }, 502);
  }
  const photoUrl: string = db.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl || "";

  // 2. AI odometer reading (best effort; staff still review)
  let ocr: { odometer: number | null; confidence: "high" | "low" | "none" } = { odometer: null, confidence: "none" };
  try {
    const { parseOdometerPhoto } = await import("@/routes/api/public/ocr-odometer");
    const res = await parseOdometerPhoto(String(body.photo_base64), photo.mime);
    ocr = { odometer: res.odometer, confidence: res.confidence };
  } catch (err) {
    console.warn("[portal-mileage] OCR failed:", err);
  }

  // 3. Insert. Supports both table layouts in use (CRM columns and the website's
  //    image_path/reading_value columns); falls back if a column does not exist.
  const now = new Date().toISOString();
  const crmCols = {
    driver_id: driver.id,
    driver_name: driver.driver_name || "Driver",
    registration: driver.reg || "",
    photo_url: photoUrl,
    ocr_mileage: ocr.odometer,
    ocr_confidence: ocr.confidence,
    status: "pending",
    submitted_at: now,
    notes: `Submitted by driver in portal: ${reading.toLocaleString("en-GB")} miles`,
  };
  const portalCols = { image_path: path, reading_value: reading };
  const attempts = [
    { ...crmCols, ...portalCols },
    crmCols,
    { driver_id: driver.id, status: "pending", submitted_at: now, ...portalCols },
  ];
  let inserted: any = null;
  let lastError = "";
  for (const row of attempts) {
    const { data, error } = await db.from("mileage_submissions").insert(row).select("id").single();
    if (!error) {
      inserted = data;
      break;
    }
    lastError = error.message;
    if (!/column|schema cache|null value/i.test(error.message)) break;
  }
  if (!inserted) {
    console.error("[portal-mileage] insert failed:", lastError, "user", user.id);
    return jsonResponse(
      { ok: false, code: "save_failed", error: "Could not save your reading. Please try again shortly." },
      500,
    );
  }

  // 4. Tell the office (email to admin@ + Telegram). Best effort; never fails the submission.
  try {
    const { notifyOdometerSubmission } = await import("@/lib/odometer-notify.server");
    const prev = Number(driver.current_mileage || 0);
    await notifyOdometerSubmission({
      driverName: driver.driver_name || "Driver",
      reg: driver.reg || "",
      reading,
      previousReading: prev > 0 ? prev : null,
      aiReading: ocr.odometer,
      aiConfidence: ocr.confidence,
      photoUrl,
      submissionId: inserted.id ?? null,
    });
  } catch (err) {
    console.warn("[portal-mileage] office notification failed:", err);
  }

  return jsonResponse(
    {
      ok: true,
      id: inserted.id,
      reading,
      ai_reading: ocr.odometer,
      ai_confidence: ocr.confidence,
      message: "Reading submitted. Our team will review it shortly.",
    },
    200,
  );
}

export const Route = createFileRoute("/api/public/portal/mileage")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
