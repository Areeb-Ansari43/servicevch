const CANONICAL_PROJECT_ID = "dozdwscwecrbykfhcxcx";
const CANONICAL_URL = `https://${CANONICAL_PROJECT_ID}.supabase.co`;

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
