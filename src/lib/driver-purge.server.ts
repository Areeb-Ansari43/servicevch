/**
 * Deleted drivers are kept for 30 days (restorable from the Audit Log), then removed for good:
 * the driver row and everything that hangs off it (charges, notifications, rent log, deposit
 * payments, documents and their files, odometer submissions and photos, mileage logs) and the
 * portal login, unless another driver record still uses that login.
 * Runs from the daily expiry job; safe to run more than once.
 */
export const DELETED_DRIVER_RETENTION_DAYS = 30;

type Db = { from: (t: string) => any; storage: { from: (b: string) => any }; auth?: any };

async function quiet<T>(p: PromiseLike<T> | (() => PromiseLike<T>)): Promise<T | null> {
  try {
    return await (typeof p === "function" ? p() : p);
  } catch {
    return null;
  }
}

export function purgeCutoff(now = new Date()): string {
  return new Date(now.getTime() - DELETED_DRIVER_RETENTION_DAYS * 86400000).toISOString();
}

export async function purgeExpiredDeletedDrivers(
  db: Db,
  now = new Date(),
): Promise<{ purged: { id: string; driver_name: string | null }[]; errors: string[] }> {
  const cutoff = purgeCutoff(now);
  const errors: string[] = [];
  const { data: rows, error } = await db
    .from("driver_tracks")
    .select("id, driver_name, reg, auth_user_id, deleted_at")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);
  if (error) return { purged: [], errors: [error.message] };

  const purged: { id: string; driver_name: string | null }[] = [];
  for (const d of (rows ?? []) as any[]) {
    try {
      // Files first (rows go with the driver)
      const docs = (await quiet(db.from("driver_documents").select("file_path").eq("driver_id", d.id))) as any;
      const docPaths = ((docs?.data ?? []) as any[]).map((r) => r.file_path).filter((p) => p && !/^https?:/.test(p));
      if (docPaths.length) await quiet(db.storage.from("driver-documents").remove(docPaths));

      const subs = (await quiet(db.from("mileage_submissions").select("image_path").eq("driver_id", d.id))) as any;
      const photoPaths = ((subs?.data ?? []) as any[]).map((r) => r.image_path).filter(Boolean);
      if (photoPaths.length) await quiet(db.storage.from("mileage-photos").remove(photoPaths));

      // Rows that are not removed automatically with the driver
      await quiet(db.from("mileage_submissions").delete().eq("driver_id", d.id));
      await quiet(db.from("mileage_logs").delete().eq("track_id", d.id));
      await quiet(db.from("deposit_payments").delete().eq("driver_id", d.id));

      const { error: delErr } = await db.from("driver_tracks").delete().eq("id", d.id);
      if (delErr) throw new Error(delErr.message);

      // Portal login, if no other driver record uses it
      if (d.auth_user_id && db.auth?.admin?.deleteUser) {
        const others = (await quiet(
          db.from("driver_tracks").select("id").eq("auth_user_id", d.auth_user_id).limit(1),
        )) as any;
        if (!others?.data?.length) await quiet(db.auth.admin.deleteUser(d.auth_user_id));
      }

      await quiet(
        db.from("audit_logs").insert({
          action_type: "driver_purged",
          target_table: "driver_tracks",
          target_id: d.id,
          actor: "System (30-day cleanup)",
          details: { driver_name: d.driver_name, reg: d.reg, deleted_at: d.deleted_at, retention_days: DELETED_DRIVER_RETENTION_DAYS },
        }),
      );
      purged.push({ id: d.id, driver_name: d.driver_name ?? null });
    } catch (err) {
      errors.push(`${d.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { purged, errors };
}
