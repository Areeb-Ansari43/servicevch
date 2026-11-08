import { createFileRoute } from "@tanstack/react-router";
import { getRuntimeEnv } from "@/integrations/supabase/config";

/**
 * Public health check. Safe to expose: it returns ONLY
 *  - build info,
 *  - which required tables/columns exist (names only, no rows),
 *  - which env var NAMES are set (never their values).
 */

/** Tables and columns the running code reads or writes. */
export const REQUIRED_SCHEMA: Record<string, string[]> = {
  login_otps: ["id", "email", "otp_hash", "code_hash", "expires_at", "consumed", "created_at"],
  portal_auth_events: [
    "id",
    "created_at",
    "hashed_email",
    "step",
    "result_code",
    "reason",
    "source",
  ],
  portal_rate_limits: ["id", "key", "action", "created_at"],
  email_log: [
    "id",
    "created_at",
    "recipient",
    "subject",
    "type",
    "status",
    "error_message",
    "metadata",
  ],
  job_runs: ["id", "job_name", "status", "started_at", "completed_at", "counts", "error_message"],
  driver_tracks: [
    "id",
    "driver_name",
    "email",
    "phone",
    "reg",
    "vehicle_id",
    "active",
    "status",
    "deleted_at",
    "auth_user_id",
    "weekly_rent",
    "rent_due_day",
    "rent_status",
    "start_date",
    "licence_expiry_date",
  ],
  vehicles: ["id", "reg", "make", "model", "next_mot_date"],
};

/** Env var names the CRM needs. `required: false` = feature degrades but the app works. */
export const ENV_VARS: { name: string; required: boolean; purpose: string }[] = [
  { name: "SUPABASE_URL", required: true, purpose: "database" },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, purpose: "server-side database access" },
  { name: "RESEND_API_KEY", required: true, purpose: "all outbound email" },
  { name: "CRON_SECRET", required: true, purpose: "daily expiry scan + watchdog auth" },
  {
    name: "PORTAL_SHARED_SECRET",
    required: true,
    purpose: "driver portal login handshake with the website",
  },
  { name: "PORTAL_OTP_PEPPER", required: true, purpose: "hashing 2FA codes" },
  {
    name: "SUPABASE_PUBLISHABLE_KEY",
    required: false,
    purpose: "server auth middleware (falls back to built-in key)",
  },
  { name: "TELEGRAM_BOT_TOKEN", required: false, purpose: "failure alerts" },
  { name: "TELEGRAM_CHAT_ID", required: false, purpose: "failure alerts" },
  { name: "GEMINI_API_KEY", required: false, purpose: "WhatsApp assistant" },
  { name: "META_ACCESS_TOKEN", required: false, purpose: "WhatsApp messaging" },
  { name: "META_PHONE_NUMBER_ID", required: false, purpose: "WhatsApp messaging" },
];

type TableCheck = { ok: boolean; missing_columns: string[]; error?: string };

/** Turns a PostgREST error into a short, non-sensitive reason. */
function shortReason(message: string): string {
  if (/does not exist|Could not find the table|schema cache/i.test(message)) return "table missing";
  if (/permission denied|row-level security/i.test(message)) return "permission denied";
  return message.slice(0, 120);
}

async function checkTable(db: any, table: string, columns: string[]): Promise<TableCheck> {
  const all = await db.from(table).select(columns.join(",")).limit(1);
  if (!all.error) return { ok: true, missing_columns: [] };

  // Is the table itself reachable?
  const base = await db.from(table).select("*", { head: true, count: "exact" }).limit(1);
  if (base.error)
    return { ok: false, missing_columns: columns, error: shortReason(base.error.message) };

  // Table exists: probe each column to name the missing ones.
  const probes = await Promise.all(
    columns.map(async (c) => ({ c, res: await db.from(table).select(c).limit(1) })),
  );
  return { ok: false, missing_columns: probes.filter((p) => p.res.error).map((p) => p.c) };
}

let cached: { at: number; body: any } | null = null;
const CACHE_MS = 30_000;

async function buildHealth() {
  const commit =
    getRuntimeEnv("GIT_COMMIT") ||
    getRuntimeEnv("CF_PAGES_COMMIT_SHA") ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "main";
  const buildTime =
    getRuntimeEnv("BUILD_TIME") || getRuntimeEnv("CF_PAGES_BUILD_TIME") || new Date().toISOString();

  const env = Object.fromEntries(
    ENV_VARS.map((v) => [v.name, getRuntimeEnv(v.name) ? "set" : "unset"]),
  );
  const missingRequiredEnv = ENV_VARS.filter((v) => v.required && env[v.name] === "unset").map(
    (v) => v.name,
  );

  const tables: Record<string, TableCheck> = {};
  let dbStatus: "ok" | "degraded" | "unavailable" = "ok";
  let dbError: string | undefined;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results = await Promise.all(
      Object.entries(REQUIRED_SCHEMA).map(
        async ([t, cols]) => [t, await checkTable(supabaseAdmin, t, cols)] as const,
      ),
    );
    for (const [t, r] of results) tables[t] = r;
    if (Object.values(tables).some((r) => !r.ok)) dbStatus = "degraded";
  } catch (e: any) {
    dbStatus = "unavailable";
    dbError = shortReason(e?.message || "database client could not start");
  }

  const missing = Object.entries(tables).flatMap(([t, r]) =>
    r.error === "table missing" ? [t] : r.missing_columns.map((c) => `${t}.${c}`),
  );

  const status = dbStatus === "ok" && missingRequiredEnv.length === 0 ? "ok" : "degraded";

  return {
    status,
    git_commit: commit,
    build_time: buildTime,
    env: process.env.NODE_ENV || "production",
    database: { status: dbStatus, ...(dbError ? { error: dbError } : {}) },
    schema: {
      status: dbStatus === "unavailable" ? "unknown" : missing.length ? "missing" : "ok",
      missing,
      tables,
    },
    env_vars: {
      missing_required: missingRequiredEnv,
      vars: env,
    },
  };
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        if (!cached || Date.now() - cached.at > CACHE_MS) {
          cached = { at: Date.now(), body: await buildHealth() };
        }
        return new Response(JSON.stringify(cached.body), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, no-cache, must-revalidate",
          },
        });
      },
    },
  },
});
