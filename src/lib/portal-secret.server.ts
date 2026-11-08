import { getRuntimeEnv } from "@/integrations/supabase/config";
import { timingSafeEqualStr } from "@/lib/cron-auth.server";

/**
 * Checks the X-Portal-Secret header sent by the public website's server proxy
 * (virtual-carhire.co.uk /api/portal/*). Both sides read the env var PORTAL_SHARED_SECRET.
 */
export type PortalSecretCheck =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      code: "missing_config" | "missing_header" | "secret_mismatch";
      reason: string;
    };

export function checkPortalSecret(request: Request): PortalSecretCheck {
  const expected = getRuntimeEnv("PORTAL_SHARED_SECRET");
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "missing_config",
      reason: "PORTAL_SHARED_SECRET is not set on the CRM",
    };
  }
  const supplied = request.headers.get("X-Portal-Secret")?.trim() || "";
  if (!supplied) {
    return {
      ok: false,
      status: 401,
      code: "missing_header",
      reason: "X-Portal-Secret header missing",
    };
  }
  if (!timingSafeEqualStr(supplied, expected)) {
    return {
      ok: false,
      status: 401,
      code: "secret_mismatch",
      reason: "X-Portal-Secret does not match PORTAL_SHARED_SECRET on the CRM",
    };
  }
  return { ok: true };
}

export function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
