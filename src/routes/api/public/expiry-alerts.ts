import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled entry point for the daily fleet expiry scan.
 *
 * Called by .github/workflows/daily-expiry-alerts.yml (and optionally Supabase pg_cron) with
 *   X-Cron-Secret: <CRON_SECRET>   (or Authorization: Bearer <CRON_SECRET>)
 *
 * Responses:
 *   200 { ok: true, ... }                         scan ran (or was already done today: skipped=true)
 *   401 { code: "missing_header" | "secret_mismatch" }
 *   503 { code: "missing_config" }               CRON_SECRET not set on the server
 *   500 { ok: false, errors: [...] }             scan or the fleet summary email failed
 *
 * Add ?force=1 to bypass the once-per-day guard (still requires the secret).
 */
async function handle(request: Request): Promise<Response> {
  const { verifyCronRequest, cronAuthErrorResponse } = await import("@/lib/cron-auth.server");
  const auth = verifyCronRequest(request);
  if (!auth.ok) return cronAuthErrorResponse(auth);

  const force = new URL(request.url).searchParams.get("force") === "1";
  const { runExpiryScan } = await import("@/lib/expiry-scan.server");
  const result = await runExpiryScan({ trigger: "cron", force });

  return new Response(
    JSON.stringify({ ...result, skipped: result.skippedEmails, alreadyRanToday: !!result.skipped }),
    {
      status: result.ok ? 200 : 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/public/expiry-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
