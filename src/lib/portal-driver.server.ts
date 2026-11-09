import { checkPortalSecret, jsonResponse } from "@/lib/portal-secret.server";

/**
 * Identifies the signed-in driver for /api/public/portal/* endpoints.
 *
 * The public website's server proxy calls these endpoints with:
 *   X-Portal-Secret: <PORTAL_SHARED_SECRET>   (proves the call comes from our website)
 *   X-Driver-Token:  <driver's Supabase access token>  (proves which driver it is)
 *
 * Data is then read with the service-role client, so the portal works regardless of which
 * row-level-security policies exist on driver_tracks / mileage_submissions.
 */
export type PortalDriver = {
  user: { id: string; email: string };
  driver: Record<string, any>;
};

export type PortalDriverResult = { ok: true; value: PortalDriver } | { ok: false; response: Response };

function escapeLike(value: string): string {
  return value.replace(/[\\%_,()]/g, (c) => `\\${c}`);
}

export async function resolvePortalDriver(request: Request): Promise<PortalDriverResult> {
  const secret = checkPortalSecret(request);
  if (!secret.ok) {
    return { ok: false, response: jsonResponse({ ok: false, code: secret.code }, secret.status) };
  }

  const token = request.headers.get("X-Driver-Token")?.trim() || "";
  if (!token || token.split(".").length !== 3) {
    return { ok: false, response: jsonResponse({ ok: false, code: "not_signed_in" }, 401) };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // getUser(jwt) validates the token without storing a session on the shared admin client.
  const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
  const user = userRes?.user;
  if (userErr || !user || !user.email) {
    return { ok: false, response: jsonResponse({ ok: false, code: "session_expired" }, 401) };
  }

  const db = supabaseAdmin as any;
  let { data: rows } = await db
    .from("driver_tracks")
    .select("*")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .limit(1);
  if (!rows || rows.length === 0) {
    ({ data: rows } = await db
      .from("driver_tracks")
      .select("*")
      .ilike("email", escapeLike(user.email.trim()))
      .is("deleted_at", null)
      .limit(1));
  }
  const driver = rows?.[0];
  if (!driver || driver.active === false) {
    return { ok: false, response: jsonResponse({ ok: false, code: "driver_not_found" }, 404) };
  }

  return { ok: true, value: { user: { id: user.id, email: user.email }, driver } };
}
