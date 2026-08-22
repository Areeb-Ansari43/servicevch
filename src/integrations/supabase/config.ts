const CANONICAL_PROJECT_ID = "dozdwscwecrbykfhcxcx";
const CANONICAL_URL = `https://${CANONICAL_PROJECT_ID}.supabase.co`;

// This is Supabase's publishable/anon key. It is intentionally browser-safe;
// database access remains protected by Supabase RLS and server routes continue
// to use the service-role key only on the server.
export const CANONICAL_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvemR3c2N3ZWNyYnlrZmhjeGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDk1NTYsImV4cCI6MjA5ODM4NTU1Nn0.DN5EYSw7JUPhuNnIrDm--IAQOFZUKMmMHCTEtSr7K_Y";

function firstNonEmpty(...values: unknown[]): string | undefined {
  return values
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)
    ?.trim();
}

export function resolveSupabaseUrl(values: { projectId?: unknown; url?: unknown }): string {
  const projectId = firstNonEmpty(values.projectId) ?? CANONICAL_PROJECT_ID;
  const configuredUrl = firstNonEmpty(values.url);
  const expectedUrl =
    projectId === CANONICAL_PROJECT_ID ? CANONICAL_URL : `https://${projectId}.supabase.co`;

  if (configuredUrl && configuredUrl.replace(/\/$/, "") !== expectedUrl) {
    throw new Error(
      `Supabase project mismatch: expected ${expectedUrl}, received ${configuredUrl}`,
    );
  }

  return expectedUrl;
}

export const SUPABASE_PROJECT_ID = CANONICAL_PROJECT_ID;
export const SUPABASE_URL = CANONICAL_URL;
