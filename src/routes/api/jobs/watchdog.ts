import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/jobs/watchdog")({
  server: {
    handlers: {
      GET: async () => runWatchdogCheck(),
      POST: async () => runWatchdogCheck(),
    },
  },
});

async function runWatchdogCheck() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString();

  // Check job runs from today for expiry-alerts and inactivity
  const { data: recentRuns, error } = await supabaseAdmin
    .from("job_runs")
    .select("*")
    .gte("started_at", startOfToday)
    .order("started_at", { ascending: false });

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const runs = recentRuns ?? [];
  const expiryRun = runs.find((r) => r.job_name === "expiry-alerts" && r.status === "success");

  const missingJobs: string[] = [];
  if (!expiryRun) {
    missingJobs.push("expiry-alerts");
  }

  if (missingJobs.length > 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        missingJobs,
        recentRunsCount: runs.length,
        message: `Missing or failed daily job execution(s): ${missingJobs.join(", ")}`,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      verifiedJobs: ["expiry-alerts"],
      runsCountToday: runs.length,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
