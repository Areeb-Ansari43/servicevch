import { createFileRoute } from "@tanstack/react-router";

/**
 * Lets the public website's server proxy record a portal_auth_events row (source "Portal")
 * for failures it detects itself, e.g. a CRM 5xx or a malformed CRM response. The website
 * only holds the public anon key, which cannot insert into portal_auth_events.
 *
 * Requires X-Portal-Secret. Body: { email?, step, result_code, reason? }
 */
const STEPS = new Set(["request_code", "verify_code", "handshake"]);

async function handle(request: Request): Promise<Response> {
  const { checkPortalSecret, jsonResponse } = await import("@/lib/portal-secret.server");
  const secret = checkPortalSecret(request);
  if (!secret.ok) return jsonResponse({ ok: false, code: secret.code }, secret.status);

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: "invalid_input" }, 400);
  }

  const step =
    typeof body.step === "string" && STEPS.has(body.step)
      ? (body.step as "request_code" | "verify_code" | "handshake")
      : null;
  const resultCode =
    typeof body.result_code === "string" && /^[a-z0-9_]{2,40}$/i.test(body.result_code)
      ? body.result_code.toUpperCase()
      : null;
  if (!step || !resultCode) return jsonResponse({ ok: false, code: "invalid_input" }, 400);

  const email = typeof body.email === "string" && body.email.includes("@") ? body.email : "unknown";
  const reason =
    typeof body.reason === "string" ? `[website] ${body.reason}`.slice(0, 500) : "[website]";

  const { logPortalAuthEvent } = await import("@/lib/portal-auth-logger");
  await logPortalAuthEvent(email, step, resultCode, reason, "Portal");
  return jsonResponse({ ok: true }, 200);
}

export const Route = createFileRoute("/api/public/portal-auth/log-event")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
    },
  },
});
