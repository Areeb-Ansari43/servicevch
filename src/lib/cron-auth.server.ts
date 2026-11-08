import { getRuntimeEnv } from "@/integrations/supabase/config";

/**
 * Shared-secret check for scheduled job endpoints (/api/public/expiry-alerts, /api/jobs/watchdog).
 *
 * The caller must send the secret in EITHER header:
 *   X-Cron-Secret: <secret>
 *   Authorization: Bearer <secret>
 *
 * Server-side secret (Cloudflare Pages env var / secret): CRON_SECRET.
 * PORTAL_SHARED_SECRET is accepted as a fallback only when CRON_SECRET is unset, for
 * backwards compatibility. There is deliberately NO hard-coded default.
 */
export type CronAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      code: "missing_config" | "secret_mismatch" | "missing_header";
      error: string;
    };

export function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function getCronSecretName(): "CRON_SECRET" | "PORTAL_SHARED_SECRET" | null {
  if (getRuntimeEnv("CRON_SECRET")) return "CRON_SECRET";
  if (getRuntimeEnv("PORTAL_SHARED_SECRET")) return "PORTAL_SHARED_SECRET";
  return null;
}

export function verifyCronRequest(request: Request): CronAuthResult {
  const secretName = getCronSecretName();
  const expected = secretName ? getRuntimeEnv(secretName) : undefined;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: "missing_config",
      error: "Server is missing CRON_SECRET. Set it in the Cloudflare Pages environment.",
    };
  }

  const headerSecret = request.headers.get("X-Cron-Secret")?.trim() || "";
  const auth = request.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const supplied = headerSecret || bearer;

  if (!supplied) {
    return {
      ok: false,
      status: 401,
      code: "missing_header",
      error: "Missing X-Cron-Secret header.",
    };
  }
  if (!timingSafeEqualStr(supplied, expected)) {
    return {
      ok: false,
      status: 401,
      code: "secret_mismatch",
      error: "Cron secret does not match.",
    };
  }
  return { ok: true };
}

export function cronAuthErrorResponse(result: Exclude<CronAuthResult, { ok: true }>): Response {
  return new Response(JSON.stringify({ ok: false, error: result.error, code: result.code }), {
    status: result.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
