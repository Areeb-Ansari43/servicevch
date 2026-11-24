/**
 * Feature switches.
 *
 * PORTAL_ENABLED: the driver portal (portal logins, invites, portal status, the Portal tab and
 * the portal admin cards in Settings) and asking for drivers' email addresses.
 * Switched off for now at the owner's request; all the portal code is kept, so turning it back
 * on is just setting this to true.
 */
export const PORTAL_ENABLED = false;

/**
 * Server side: the portal login and data endpoints answer only when the portal is on.
 * Defaults to PORTAL_ENABLED; setting the environment variable PORTAL_ENABLED=true (Cloudflare
 * settings) turns the endpoints back on without a code change.
 */
export function portalApiEnabled(): boolean {
  const env = typeof process !== "undefined" ? process.env?.PORTAL_ENABLED : undefined;
  const runtime = (globalThis as { __env__?: Record<string, unknown> }).__env__?.PORTAL_ENABLED;
  const v = String(runtime ?? env ?? "").toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return PORTAL_ENABLED;
}

export function portalDisabledResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      success: false,
      code: "portal_disabled",
      error: "The driver portal is switched off at the moment.",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}
