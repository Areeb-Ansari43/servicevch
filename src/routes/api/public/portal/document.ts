import { createFileRoute } from "@tanstack/react-router";

/**
 * Driver portal document upload (called by the website's /api/portal/document proxy).
 *
 * Body: { document_type, file_name, file_base64: "data:<mime>;base64,..." }
 * Stores the file in the "driver-documents" bucket under the driver's folder and adds a
 * driver_documents row, the same way the CRM's own upload does, so it appears in the
 * driver's Documents in both the CRM and the portal.
 */
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["contract", "permission_letter", "vehicle_schedule", "pco_licence"] as const;
const ALLOWED_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

async function handle(request: Request): Promise<Response> {
  const { resolvePortalDriver } = await import("@/lib/portal-driver.server");
  const { jsonResponse } = await import("@/lib/portal-secret.server");
  const resolved = await resolvePortalDriver(request);
  if (!resolved.ok) return resolved.response;
  const { driver, user } = resolved.value;

  let body: { document_type?: unknown; file_name?: unknown; file_base64?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "invalid_input", error: "Invalid request." }, 400);
  }

  const docType = TYPES.includes(body.document_type as any) ? (body.document_type as (typeof TYPES)[number]) : "contract";
  const rawName = typeof body.file_name === "string" && body.file_name.trim() ? body.file_name.trim() : "document";
  const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(typeof body.file_base64 === "string" ? body.file_base64 : "");
  if (!m || !ALLOWED_MIME.test(m[1])) {
    return jsonResponse({ ok: false, code: "invalid_file", error: "Please choose a PDF or photo." }, 400);
  }
  const bin = atob(m[2]);
  if (bin.length > MAX_BYTES) {
    return jsonResponse({ ok: false, code: "file_too_large", error: "File is too large (max 10 MB)." }, 413);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const safeName = rawName.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 120);
  const path = `${driver.id}/${docType}_${Date.now()}_${safeName}`;

  const { error: upErr } = await db.storage
    .from("driver-documents")
    .upload(path, bytes, { contentType: m[1].toLowerCase(), upsert: false });
  if (upErr) {
    console.error("[portal-document] upload failed:", upErr.message);
    return jsonResponse({ ok: false, code: "upload_failed", error: "Could not upload the file. Please try again." }, 502);
  }

  const { error: dbErr } = await db.from("driver_documents").insert({
    driver_id: driver.id,
    user_id: user.id,
    document_type: docType,
    file_name: rawName.slice(0, 200),
    file_path: path,
    file_size: bytes.length,
  });
  if (dbErr) {
    console.error("[portal-document] insert failed:", dbErr.message);
    return jsonResponse({ ok: false, code: "save_failed", error: "Could not save the document. Please try again." }, 500);
  }

  return jsonResponse({ ok: true, message: "Document uploaded. Our team can now see it." }, 200);
}

export const Route = createFileRoute("/api/public/portal/document")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
