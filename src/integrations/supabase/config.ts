const CANONICAL_PROJECT_ID = "hhpkffratbbnwedjlebx";
const CANONICAL_URL = `https://${CANONICAL_PROJECT_ID}.supabase.co`;

// This is Supabase's publishable/anon key. It is intentionally browser-safe;
// database access remains protected by Supabase RLS and server routes continue
// to use the service-role key only on the server.
export const CANONICAL_PUBLISHABLE_KEY = "sb_publishable_xQmRi0TssVJl6Io1Efg8dQ_TuLLx0lR";

function firstNonEmpty(...values: unknown[]): string | undefined {
  return values
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();
}

export function getRuntimeEnv(name: string): string | undefined {
  const cloudflareEnv = (
    globalThis as typeof globalThis & {
      __env__?: Record<string, unknown>;
    }
  ).__env__;
  const processEnv = typeof process !== "undefined" ? process.env : undefined;
  return firstNonEmpty(cloudflareEnv?.[name], processEnv?.[name]);
}

export function resolveSupabaseUrl(values: { projectId?: unknown; url?: unknown }): string {
  const configuredProjectId = firstNonEmpty(values.projectId);
  const configuredUrl = firstNonEmpty(values.url)?.replace(/\/$/, "");

  if (configuredProjectId && configuredProjectId !== CANONICAL_PROJECT_ID) {
    console.warn(
      `[Supabase] Ignoring mismatched project ID ${configuredProjectId}; using ${CANONICAL_PROJECT_ID}.`,
    );
  }
  if (configuredUrl && configuredUrl !== CANONICAL_URL) {
    console.warn(`[Supabase] Ignoring mismatched URL ${configuredUrl}; using ${CANONICAL_URL}.`);
  }

  return CANONICAL_URL;
}

export function resolveSupabasePublishableKey(value: unknown): string {
  const configuredKey = firstNonEmpty(value);
  if (configuredKey && configuredKey !== CANONICAL_PUBLISHABLE_KEY) {
    console.warn("[Supabase] Ignoring a non-canonical publishable key.");
  }
  return CANONICAL_PUBLISHABLE_KEY;
}

export const SUPABASE_PROJECT_ID = CANONICAL_PROJECT_ID;
export const SUPABASE_URL = CANONICAL_URL;
