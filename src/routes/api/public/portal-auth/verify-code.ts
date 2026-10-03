import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRuntimeEnv } from "@/integrations/supabase/config";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const Route = createFileRoute("/api/public/portal-auth/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => handleVerifyCode(request),
    },
  },
});

export async function handleVerifyCode(request: Request): Promise<Response> {
  // Secret verification
  const portalSecret = getRuntimeEnv("PORTAL_SHARED_SECRET");
  const reqSecret = request.headers.get("X-Portal-Secret");

  if (!portalSecret || !reqSecret || reqSecret !== portalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  const genericInvalidError = new Response(
    JSON.stringify({ error: "Invalid or expired verification code." }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );

  if (!email || !code || !/^\d{6}$/.test(code) || email === "admin@fa-ibi.co.uk") {
    return genericInvalidError;
  }

  const codeHash = await sha256(`${email}:${code}`);

  // Query active unconsumed OTP for this email
  const { data: rows, error } = await supabaseAdmin
    .from("login_otps")
    .select("id, expires_at, consumed, attempts_count, code_hash")
    .eq("email", email)
    .eq("consumed", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !rows || rows.length === 0) {
    return genericInvalidError;
  }

  const row = rows[0];

  // Expiry check (10 minutes)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);
    return genericInvalidError;
  }

  // Maximum failed attempts check (limit 5)
  const currentAttempts = Number(row.attempts_count || 0);
  if (currentAttempts >= 5) {
    await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);
    return genericInvalidError;
  }

  // Check code hash match
  if (row.code_hash !== codeHash) {
    const nextAttempts = currentAttempts + 1;
    await supabaseAdmin
      .from("login_otps")
      .update({
        attempts_count: nextAttempts,
        consumed: nextAttempts >= 5,
      })
      .eq("id", row.id);
    return genericInvalidError;
  }

  // Mark code as single-use consumed
  await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);

  // Verify driver record is active before minting token
  const { data: driverMatch } = await supabaseAdmin
    .from("driver_tracks")
    .select("id, active, deleted_at, auth_user_id")
    .or(`auth_user_id.neq.null,email.ilike.${email}`)
    .eq("email", email)
    .maybeSingle();

  if (driverMatch && (driverMatch.active === false || driverMatch.deleted_at)) {
    return genericInvalidError;
  }

  // Mint magiclink session on-the-fly via Supabase Admin API
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    return new Response(JSON.stringify({ error: "Failed to mint login session." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      session: {
        access_token: link.properties.hashed_token,
        refresh_token: link.properties.hashed_token,
      },
      driver: {
        id: driverMatch?.id || null,
        email,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
