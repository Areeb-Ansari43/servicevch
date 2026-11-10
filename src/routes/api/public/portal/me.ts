import { createFileRoute } from "@tanstack/react-router";

/**
 * Driver portal dashboard data, read server-side with the service role.
 * Called only by the website's /api/portal/me proxy (X-Portal-Secret + X-Driver-Token).
 *
 * Returns the signed-in driver's own rent, vehicle, mileage, charges, notifications,
 * odometer submissions and documents. Body { mark_read: true } marks returned unread
 * notifications as read.
 */
async function handle(request: Request): Promise<Response> {
  const { resolvePortalDriver } = await import("@/lib/portal-driver.server");
  const { jsonResponse } = await import("@/lib/portal-secret.server");
  const resolved = await resolvePortalDriver(request);
  if (!resolved.ok) return resolved.response;
  const { driver } = resolved.value;

  let body: { mark_read?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getNextMotDate, getPcoExpiryDate } = await import("@/lib/vehicle-date-fields");
  const db = supabaseAdmin as any;

  const safe = async <T,>(p: PromiseLike<{ data: T | null }>): Promise<T | null> => {
    try {
      return (await p).data ?? null;
    } catch {
      return null;
    }
  };

  const [vehicle, charges, notifications, submissions, documents] = await Promise.all([
    driver.vehicle_id
      ? safe(db.from("vehicles").select("*").eq("id", driver.vehicle_id).maybeSingle())
      : driver.reg
        ? safe(db.from("vehicles").select("*").eq("reg", driver.reg).maybeSingle())
        : Promise.resolve(null),
    safe(db.from("driver_charges").select("*").eq("driver_id", driver.id)),
    safe(
      db
        .from("driver_notifications")
        .select("id, type, title, message, read, created_at")
        .eq("driver_id", driver.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
    safe(
      db
        .from("mileage_submissions")
        .select("*")
        .eq("driver_id", driver.id)
        .order("submitted_at", { ascending: false })
        .limit(10),
    ),
    safe(db.from("driver_documents").select("*").eq("driver_id", driver.id)),
  ]);

  // Rent week: same rules as the CRM (Paid until the next due day arrives, then Unpaid).
  const { rentState } = await import("@/lib/rent-cycle");
  const weeklyRent = Number(driver.weekly_rent || 0);
  const rent = weeklyRent > 0 && driver.rent_due_day ? rentState(driver) : null;
  // When this week is paid, show the next due date; otherwise the date the unpaid week was due.
  const nextDueStr = rent ? (rent.paid ? rent.nextDue : (rent.currentDue ?? rent.nextDue)) : null;

  // Signed links for documents (works whether or not the bucket is public).
  const docs = await Promise.all(
    ((documents as any[]) ?? []).map(async (d) => {
      let url: string | null = null;
      if (d.file_path && /^https?:\/\//.test(d.file_path)) url = d.file_path;
      else if (d.file_path) {
        try {
          const { data } = await db.storage.from("driver-documents").createSignedUrl(d.file_path, 3600);
          url = data?.signedUrl ?? null;
        } catch {
          url = null;
        }
      }
      return {
        id: d.id,
        name: d.label || d.file_name || "Document",
        type: d.document_type || "Document",
        uploaded_at: d.uploaded_at || d.created_at || null,
        url,
      };
    }),
  );

  const v = vehicle as any;
  const notifs = ((notifications as any[]) ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    read: n.read === true,
    created_at: n.created_at,
  }));

  if (body.mark_read) {
    const unread = notifs.filter((n) => !n.read).map((n) => n.id);
    if (unread.length) {
      try {
        await db.from("driver_notifications").update({ read: true }).in("id", unread);
      } catch {
        // non-fatal
      }
    }
  }

  return jsonResponse(
    {
      ok: true,
      driver: {
        id: driver.id,
        name: driver.driver_name,
        email: driver.email,
        weekly_rent: weeklyRent || null,
        rent_due_day: driver.rent_due_day || null,
        next_due_date: nextDueStr,
        rent_status: rent ? (rent.paid ? "paid" : "unpaid") : driver.rent_status || null,
        paid_for_week_due: driver.rent_paid_for_due_date ?? null,
        balance_due: Number(driver.balance_due || 0),
        current_mileage: Number(driver.current_mileage || 0),
        start_mileage: Number(driver.start_mileage || 0),
        // Same as the CRM: miles this period = odometer now - odometer at period start.
        // Unknown (null) until a month-start reading exists, so the whole odometer is never
        // shown as this month's miles.
        miles_this_period:
          Number(driver.start_mileage || 0) > 0
            ? Math.max(0, Number(driver.current_mileage || 0) - Number(driver.start_mileage || 0))
            : null,
        last_odometer: Number(driver.current_mileage || 0) || null,
        phone: driver.phone || null,
        start_date: driver.start_date || null,
        allowance: driver.allowance != null ? Number(driver.allowance) : null,
        excess_rate_pence: driver.rate_pence != null ? Number(driver.rate_pence) : null,
        licence_expiry_date: driver.licence_expiry_date || null,
        deposit_status: driver.deposit_status || null,
      },
      vehicle: v
        ? {
            reg: v.reg || driver.reg || null,
            make: v.make || null,
            model: v.model || null,
            year: v.year || null,
            fuel_type: v.fuel_type || null,
            next_mot_date: getNextMotDate(v) || null,
            pco_expiry_date: getPcoExpiryDate(v) || null,
            next_service_date: v.next_service_date || null,
          }
        : driver.reg
          ? { reg: driver.reg }
          : null,
      charges: ((charges as any[]) ?? [])
        .filter((c) => !["paid", "settled", "cancelled"].includes(String(c.status || "").toLowerCase()))
        .map((c) => ({
          id: c.id,
          description: c.description || "Extra charge",
          amount: Number(c.amount || 0),
          created_at: c.created_at,
        })),
      notifications: notifs,
      submissions: ((submissions as any[]) ?? []).map((s) => ({
        id: s.id,
        submitted_at: s.submitted_at || s.created_at,
        status: s.status || "pending",
        reading: s.reading_value ?? s.approved_mileage ?? s.ocr_mileage ?? null,
        approved_mileage: s.approved_mileage ?? null,
        rejection_reason: s.rejection_reason ?? null,
        photo_url:
          s.photo_url ||
          (s.image_path ? db.storage.from("mileage-photos").getPublicUrl(s.image_path).data?.publicUrl : null) ||
          null,
      })),
      documents: docs,
    },
    200,
  );
}

export const Route = createFileRoute("/api/public/portal/me")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
