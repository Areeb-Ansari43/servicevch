import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/job-runs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Requires a signed-in CRM session (Authorization: Bearer <access token>).
        const auth = request.headers.get("Authorization") || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        const { data: userRes } = token
          ? await supabaseAdmin.auth.getUser(token)
          : { data: { user: null } };
        if (!userRes?.user) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

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
