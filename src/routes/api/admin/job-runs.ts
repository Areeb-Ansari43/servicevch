import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/job-runs")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data, error } = await supabaseAdmin
          .from("job_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(30);

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ ok: true, jobRuns: data ?? [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
