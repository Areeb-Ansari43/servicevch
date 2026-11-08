import { createFileRoute } from "@tanstack/react-router";
import { runExpiryScan } from "@/routes/api/public/expiry-alerts";
import { sendTelegramAlert } from "@/lib/telegram.server";
import { getRuntimeEnv } from "@/integrations/supabase/config";

function verifyCronSecret(request: Request): boolean {
  const cronSecret =
    getRuntimeEnv("CRON_SECRET") ||
    getRuntimeEnv("PORTAL_SHARED_SECRET") ||
    process.env.CRON_SECRET ||
    process.env.PORTAL_SHARED_SECRET ||
    "vch-cron-secret-2026";

  const authHeader = request.headers.get("Authorization") || "";
  const headerSecret = request.headers.get("X-Cron-Secret") || "";

  if (headerSecret && headerSecret === cronSecret) return true;
  if (authHeader.startsWith("Bearer ") && authHeader.slice(7) === cronSecret) return true;

  if (process.env.NODE_ENV === "development") return true;

  return false;
}

export const Route = createFileRoute("/api/jobs/watchdog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!verifyCronSecret(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return runWatchdogCheck();
      },
      POST: async ({ request }) => {
        if (!verifyCronSecret(request)) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        return runWatchdogCheck();
      },
    },
  },
});

export async function runWatchdogCheck() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Determine start of today in Europe/London timezone ISO format
  const londonToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const startOfTodayISO = `${londonToday}T00:00:00.000Z`;

  // 1. Check job runs from today for expiry-alerts
  const { data: recentRuns, error: jobError } = await supabaseAdmin
    .from("job_runs")
    .select("*")
    .gte("started_at", startOfTodayISO)
    .order("started_at", { ascending: false });

  if (jobError) {
    console.error("[Watchdog] Error querying job_runs:", jobError);
  }

  const runs = recentRuns ?? [];
  const expiryRun = runs.find((r) => r.job_name === "expiry-alerts" && r.status === "success");

  let executedFallbackScan = false;
  let fallbackScanCounts = null;

  // If expiry-alerts job is missing or failed today, execute fallback run and send Telegram alert
  if (!expiryRun) {
    console.warn("[Watchdog] Expiry alerts job missing or failed for today. Running fallback scan...");

    const alertMessage = `⚠️ <b>VCH Watchdog Warning:</b> Expiry alerts scan was missing or failed today (${londonToday}). Executing automatic fallback scan now.`;
    await sendTelegramAlert(alertMessage);

    try {
      const scanRes = await runExpiryScan();
      const scanData = await scanRes.json();
      executedFallbackScan = true;
      fallbackScanCounts = scanData;
    } catch (err: any) {
      console.error("[Watchdog] Error executing fallback expiry scan:", err);
      const errMessage = `🚨 <b>VCH Watchdog Critical Alert:</b> Fallback expiry scan failed! Error: ${err.message || err}`;
      await sendTelegramAlert(errMessage);
    }
  }

  // 2. Check email_log from today for failed send attempts
  const { data: failedLogs, error: logError } = await supabaseAdmin
    .from("email_log")
    .select("*")
    .gte("created_at", startOfTodayISO)
    .eq("status", "failed")
    .order("created_at", { ascending: false });

  if (logError) {
    console.error("[Watchdog] Error querying email_log failed records:", logError);
  }

  const failedEmails = failedLogs ?? [];
  if (failedEmails.length > 0) {
    console.warn(`[Watchdog] Found ${failedEmails.length} failed email send(s) today.`);
    const details = failedEmails
      .slice(0, 5)
      .map((f) => `• <b>${f.type}</b> to ${f.recipient}: ${f.error_message || "Unknown error"}`)
      .join("\n");

    const failedTelegramText = `🚨 <b>VCH Watchdog Email Failure Alert:</b>\n${failedEmails.length} email send(s) failed today (${londonToday}):\n\n${details}`;
    await sendTelegramAlert(failedTelegramText);
  }

  const isOk = expiryRun !== undefined || executedFallbackScan;

  return new Response(
    JSON.stringify({
      ok: isOk,
      verifiedJobs: ["expiry-alerts"],
      runsCountToday: runs.length,
      executedFallbackScan,
      fallbackScanCounts,
      failedEmailsCountToday: failedEmails.length,
    }),
    { status: isOk ? 200 : 500, headers: { "Content-Type": "application/json" } }
  );
}
