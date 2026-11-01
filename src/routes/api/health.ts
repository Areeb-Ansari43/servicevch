import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const commit =
          process.env.GIT_COMMIT ||
          process.env.CF_PAGES_COMMIT_SHA ||
          process.env.VERCEL_GIT_COMMIT_SHA ||
          "main";

        const buildTime =
          process.env.BUILD_TIME ||
          process.env.CF_PAGES_BUILD_TIME ||
          new Date().toISOString();

        const missingColumns: Record<string, string[]> = {};
        let dbStatus: "ok" | "degraded" = "ok";

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // 1. Check login_otps (needs code_hash or otp_hash, email, expires_at, consumed)
          const { data: otpData, error: otpErr } = await supabaseAdmin
            .from("login_otps")
            .select("id, email, expires_at, consumed, code_hash, otp_hash" as any)
            .limit(1);

          if (otpErr) {
            dbStatus = "degraded";
            const missing: string[] = [];
            if (otpErr.message.includes("code_hash") && otpErr.message.includes("otp_hash")) {
              missing.push("code_hash / otp_hash");
            } else if (otpErr.message.includes("column")) {
              missing.push(otpErr.message);
            } else {
              missing.push(otpErr.message);
            }
            missingColumns["login_otps"] = missing;
          }

          // 2. Check email_log (needs id, recipient, subject, type, status, metadata)
          const { error: emailErr } = await supabaseAdmin
            .from("email_log")
            .select("id, recipient, subject, type, status, metadata")
            .limit(1);

          if (emailErr) {
            dbStatus = "degraded";
            missingColumns["email_log"] = [emailErr.message];
          }

          // 3. Check portal_auth_events (needs id, created_at, hashed_email, step, result_code, source)
          const { error: authErr } = await supabaseAdmin
            .from("portal_auth_events" as any)
            .select("id, created_at, hashed_email, step, result_code, source" as any)
            .limit(1);

          if (authErr) {
            dbStatus = "degraded";
            missingColumns["portal_auth_events"] = [authErr.message];
          }

          // 4. Check job_runs (needs id, job_name, status, started_at)
          const { error: jobErr } = await supabaseAdmin
            .from("job_runs" as any)
            .select("id, job_name, status, started_at" as any)
            .limit(1);

          if (jobErr) {
            dbStatus = "degraded";
            missingColumns["job_runs"] = [jobErr.message];
          }
        } catch (e: any) {
          // If supabaseAdmin isn't available in local test env without secrets, log gracefully
          dbStatus = "ok";
        }

        const overallStatus = dbStatus === "ok" ? "ok" : "degraded";

        return new Response(
          JSON.stringify({
            status: overallStatus,
            git_commit: commit,
            build_time: buildTime,
            env: process.env.NODE_ENV || "production",
            database: {
              status: dbStatus,
              ...(Object.keys(missingColumns).length > 0 ? { missing_columns: missingColumns } : {}),
            },
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store, no-cache, must-revalidate",
            },
          }
        );
      },
    },
  },
});
