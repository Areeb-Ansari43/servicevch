import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type PortalAuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  linkedDriver: {
    id: string;
    driver_name: string;
    registration: string;
    active?: boolean | null;
    deleted_at?: string | null;
  } | null;
  isOrphaned: boolean;
};

const deleteAccountSchema = z.object({
  authUserId: z.string().uuid(),
  driverId: z.string().uuid().optional().nullable(),
  permanent: z.boolean().optional().default(true),
});

const restoreDriverSchema = z.object({
  driverId: z.string().uuid(),
});

/**
  List all Supabase Auth users and cross-reference against active/soft-deleted driver_tracks.
  Identifies linked drivers (e.g. Areeb, Sajid) vs orphaned accounts from prior testing.
 */
export const listPortalAuthUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Fetch all Supabase Auth users via Service Role
    const { data: authUsersRes, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (authErr) {
      console.error("[listPortalAuthUsers] Error fetching auth.users:", authErr.message);
      throw new Error(`Failed to list auth users: ${authErr.message}`);
    }

    const rawUsers = authUsersRes?.users ?? [];

    // 2. Fetch all driver_tracks (including soft-deleted)
    const { data: driverTracks, error: driverErr } = await context.supabase
      .from("driver_tracks")
      .select("id, driver_name, reg, email, phone, auth_user_id, active, deleted_at");

    if (driverErr) {
      console.error("[listPortalAuthUsers] Error fetching driver_tracks:", driverErr.message);
      throw new Error(`Failed to query driver tracks: ${driverErr.message}`);
    }

    const drivers = driverTracks ?? [];

    // Map each driver by auth_user_id and by lowercased email
    const driverByAuthId = new Map<string, (typeof drivers)[0]>();
    const driverByEmail = new Map<string, (typeof drivers)[0]>();

    for (const d of drivers) {
      if (d.auth_user_id) {
        driverByAuthId.set(d.auth_user_id, d);
      }
      if (d.email) {
        driverByEmail.set(d.email.trim().toLowerCase(), d);
      }
    }

    // 3. Cross-reference Auth users against driver tracks
    const portalUsers: PortalAuthUser[] = rawUsers.map((u) => {
      let matchedDriver = driverByAuthId.get(u.id);

      if (!matchedDriver && u.email) {
        matchedDriver = driverByEmail.get(u.email.trim().toLowerCase());
      }

      const isOrphaned = !matchedDriver || Boolean(matchedDriver.deleted_at) || matchedDriver.active === false;

      return {
        id: u.id,
        email: u.email ?? null,
        phone: u.phone ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        linkedDriver: matchedDriver
          ? {
              id: matchedDriver.id,
              driver_name: matchedDriver.driver_name,
              registration: matchedDriver.reg,
              active: matchedDriver.active,
              deleted_at: matchedDriver.deleted_at,
            }
          : null,
        isOrphaned,
      };
    });

    return { users: portalUsers };
  });

/**
  Delete or revoke a portal account.
  If permanent === true: calls Supabase Auth Admin deleteUser capability to revoke access permanently.
  If permanent === false: soft-deletes driver track (retaining auth_user_id) for 48h recovery window.
  Logs action to audit_logs.
 */
export const deletePortalAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => deleteAccountSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId, claims } = context;
    const actorEmail = claims?.email ?? userId;

    let targetDriverId = data.driverId;
    let targetDriverName: string | null = null;
    let targetEmail: string | null = null;

    // Resolve linked driver if driverId wasn't passed directly
    if (!targetDriverId) {
      const { data: matched } = await context.supabase
        .from("driver_tracks")
        .select("id, driver_name, email")
        .eq("auth_user_id", data.authUserId)
        .maybeSingle();

      if (matched) {
        targetDriverId = matched.id;
        targetDriverName = matched.driver_name;
        targetEmail = matched.email;
      }
    } else {
      const { data: matched } = await context.supabase
        .from("driver_tracks")
        .select("driver_name, email")
        .eq("id", targetDriverId)
        .maybeSingle();

      if (matched) {
        targetDriverName = matched.driver_name;
        targetEmail = matched.email;
      }
    }

    if (data.permanent) {
      // 1. Permanently delete underlying Supabase Auth user via Service Role
      const { error: deleteUserErr } = await supabaseAdmin.auth.admin.deleteUser(data.authUserId);
      if (deleteUserErr) {
        console.error("[deletePortalAccount] Service role deleteUser error:", deleteUserErr.message);
        throw new Error(`Failed to delete Supabase Auth user: ${deleteUserErr.message}`);
      }

      // 2. Unlink auth_user_id and reset invite flags on driver_tracks
      if (targetDriverId) {
        await context.supabase
          .from("driver_tracks")
          .update({
            auth_user_id: null,
            invite_token: null,
            invite_status: "none",
          } as never)
          .eq("id", targetDriverId);
      }

      // 3. Record append-only entry in audit_logs
      await context.supabase.from("audit_logs").insert({
        actor: actorEmail || "Fleet Admin",
        action_type: "portal_account_deleted",
        target_table: "auth.users",
        target_id: data.authUserId,
        details: {
          driver_id: targetDriverId ?? null,
          driver_name: targetDriverName ?? null,
          email: targetEmail ?? null,
          permanent: true,
        },
      } as never);

      return { success: true, authUserId: data.authUserId, permanent: true };
    } else {
      // Soft-delete: mark deleted_at and set active = false on driver_tracks, retaining auth_user_id for 48h recovery
      if (targetDriverId) {
        await context.supabase
          .from("driver_tracks")
          .update({
            deleted_at: new Date().toISOString(),
            active: false,
          } as never)
          .eq("id", targetDriverId);
      }

      // Record audit log event
      await context.supabase.from("audit_logs").insert({
        actor: actorEmail || "Fleet Admin",
        action_type: "portal_account_soft_deleted",
        target_table: "driver_tracks",
        target_id: targetDriverId ?? data.authUserId,
        details: {
          driver_id: targetDriverId ?? null,
          driver_name: targetDriverName ?? null,
          auth_user_id: data.authUserId,
          recovery_window: "48h",
        },
      } as never);

      return { success: true, authUserId: data.authUserId, permanent: false };
    }
  });

/**
  Restore a soft-deleted driver and their portal account access within the 48-hour recovery window.
 */
export const restoreDriverAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => restoreDriverSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context;
    const actorEmail = claims?.email ?? userId;

    const { data: driverTrack, error: findErr } = await context.supabase
      .from("driver_tracks")
      .select("id, driver_name, auth_user_id, reg")
      .eq("id", data.driverId)
      .maybeSingle();

    if (findErr) throw new Error(findErr.message);
    if (!driverTrack) throw new Error("Driver track not found");

    // Reactivate driver track and clear deleted_at timestamp
    const { error: updateErr } = await context.supabase
      .from("driver_tracks")
      .update({
        deleted_at: null,
        active: true,
      } as never)
      .eq("id", data.driverId);

    if (updateErr) throw new Error(updateErr.message);

    // Audit log
    await context.supabase.from("audit_logs").insert({
      actor: actorEmail || "Fleet Admin",
      action_type: "driver_restored",
      target_table: "driver_tracks",
      target_id: data.driverId,
      details: {
        driver_name: driverTrack.driver_name,
        reg: driverTrack.reg,
        auth_user_id: driverTrack.auth_user_id,
      },
    } as never);

    return { success: true, driverId: data.driverId };
  });
