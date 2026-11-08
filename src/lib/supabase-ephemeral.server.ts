import { createClient } from "@supabase/supabase-js";
import {
  getRuntimeEnv,
  resolveSupabasePublishableKey,
  resolveSupabaseUrl,
} from "@/integrations/supabase/config";

/**
 * A throwaway, per-request Supabase client for USER auth calls
 * (signInWithPassword, verifyOtp).
 *
 * Never call those methods on the shared `supabaseAdmin`: supabase-js stores the resulting user
 * session in memory (even with persistSession: false). Every later supabaseAdmin query in the
 * same Cloudflare isolate then runs with that driver's JWT instead of the service role, so RLS
 * blocks them. For example, inserts into login_otps (deny-all policy) fail and the portal shows
 * "Authentication service temporarily unavailable".
 */
export function createEphemeralAuthClient() {
  const url = resolveSupabaseUrl({
    projectId: getRuntimeEnv("SUPABASE_PROJECT_ID"),
    url: getRuntimeEnv("SUPABASE_URL"),
  });
  const key = resolveSupabasePublishableKey(getRuntimeEnv("SUPABASE_PUBLISHABLE_KEY"));
  // New-format keys (sb_publishable_/sb_secret_) are opaque strings, not bearer JWTs.
  const opaqueKey = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  const keyFetch: typeof fetch = (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    if (opaqueKey && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
  return createClient(url, key, {
    global: { fetch: keyFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
