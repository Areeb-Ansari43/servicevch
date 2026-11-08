import { createFileRoute } from "@tanstack/react-router";

/**
 * Shared-secret handshake used by the website's protected diagnostic endpoint
 * (virtual-carhire.co.uk /api/portal/diagnostics). It only says whether the caller's
 * X-Portal-Secret matches PORTAL_SHARED_SECRET here, plus whether the CRM can send
 * the 2FA email. It never returns any secret value or user data.
 *
 *   200 { ok: true,  code: "ok", email_configured: boolean }
 *   401 { ok: false, code: "missing_header" | "secret_mismatch" }
 *   503 { ok: false, code: "missing_config" }
 */
async function handle(request: Request): Promise<Response> {
  const { checkPortalSecret, jsonResponse } = await import("@/lib/portal-secret.server");
  const { logPortalAuthEvent } = await import("@/lib/portal-auth-logger");
  const { getRuntimeEnv } = await import("@/integrations/supabase/config");

  const secret = checkPortalSecret(request);
  if (!secret.ok) {
    await logPortalAuthEvent("diagnostics", "handshake", secret.code.toUpperCase(), secret.reason);
    return jsonResponse({ ok: false, code: secret.code }, secret.status);
  }
  return jsonResponse(
    {
      ok: true,
      code: "ok",
      email_configured: Boolean(getRuntimeEnv("RESEND_API_KEY")),
      otp_pepper_configured: Boolean(getRuntimeEnv("PORTAL_OTP_PEPPER")),
    },
    200,
  );
}

export const Route = createFileRoute("/api/public/portal-auth/handshake")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
