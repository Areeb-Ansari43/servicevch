import { createFileRoute } from "@tanstack/react-router";
import { sendTelegramAlert } from "@/lib/telegram.server";

export const Route = createFileRoute("/api/jobs/watchdog")({
  server: {
    handlers: {
      GET: async ({ request }) => guarded(request),
      POST: async ({ request }) => guarded(request),
    },
  },
});

async function guarded(request: Request): Promise<Response> {
  const { verifyCronRequest, cronAuthErrorResponse } = await import("@/lib/cron-auth.server");
  const auth = verifyCronRequest(request);
  if (!auth.ok) return cronAuthErrorResponse(auth);
  return runWatchdogCheck();
}

export async function runWatchdogCheck() {
  // Generated DB types are out of date for job_runs/email_log; query untyped.
  const supabaseAdmin: any = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

  // Determine start of today in Europe/London timezone ISO format
  const londonToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { runExpiryScan, londonMidnightUtcISO, EXPIRY_JOB_NAME } =
    await import("@/lib/expiry-scan.server");
  const startOfTodayISO = londonMidnightUtcISO();

  let watchdogRunId: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("job_runs")
      .insert({ job_name: "job-watchdog", status: "running", started_at: new Date().toISOString() })
      .select("id")
      .single();
    watchdogRunId = (data as any)?.id ?? null;
  } catch (err) {
    console.warn("[Watchdog] Could not insert job_runs row:", err);
  }

  // 1. Check job runs from today for expiry-alerts
  const { data: recentRuns, error: jobError } = await supabaseAdmin
    .from("job_runs")
    .select("*")
    .gte("started_at", startOfTodayISO)
    .order("started_at", { ascending: false });

  if (jobError) {
    console.error("[Watchdog] Error querying job_runs:", jobError);
  }

  const runs: any[] = recentRuns ?? [];
  const expiryRun = runs.find((r) => r.job_name === EXPIRY_JOB_NAME && r.status === "success");

  let executedFallbackScan = false;
  let fallbackScanCounts = null;

  // If expiry-alerts job is missing or failed today, execute fallback run and send Telegram alert
  if (!expiryRun) {
    console.warn(
      "[Watchdog] Expiry alerts job missing or failed for today. Running fallback scan...",
    );

    const alertMessage = `⚠️ <b>VCH Watchdog Warning:</b> Expiry alerts scan was missing or failed today (${londonToday}). Executing automatic fallback scan now.`;
    await sendTelegramAlert(alertMessage);

    try {
      const scanData = await runExpiryScan({ trigger: "watchdog" });
      executedFallbackScan = scanData.ok;
      fallbackScanCounts = scanData as any;
      if (!scanData.ok) {
        await sendTelegramAlert(
          `🚨 <b>VCH Watchdog Critical Alert:</b> Fallback expiry scan failed: ${(scanData.errors[0] || "unknown error").slice(0, 300)}`,
        );
      }
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

  const failedEmails: any[] = failedLogs ?? [];
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

  if (watchdogRunId) {
    try {
      await supabaseAdmin
        .from("job_runs")
        .update({
          status: isOk ? "success" : "failed",
          completed_at: new Date().toISOString(),
          counts: {
            executedFallbackScan,
            runsCountToday: runs.length,
            failedEmailsCountToday: failedEmails.length,
          },
          error_message: isOk ? null : "Expiry scan missing today and fallback scan failed",
        })
        .eq("id", watchdogRunId);
    } catch (err) {
      console.warn("[Watchdog] Could not update job_runs row:", err);
    }
  }

  return new Response(
    JSON.stringify({
      ok: isOk,
      verifiedJobs: ["expiry-alerts"],
      runsCountToday: runs.length,
      executedFallbackScan,
      fallbackScanCounts,
      failedEmailsCountToday: failedEmails.length,
    }),
    { status: isOk ? 200 : 500, headers: { "Content-Type": "application/json" } },
  );
}
