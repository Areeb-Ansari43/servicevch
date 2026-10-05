import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { checkDurableRateLimit, hmacSha256 } from "./request-code";
import { logPortalAuthEvent } from "@/lib/portal-auth-logger";

export const Route = createFileRoute("/api/public/portal-auth/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => handleVerifyCode(request),
    },
  },
});

export async function handleVerifyCode(request: Request): Promise<Response> {
  // 1. Secret verification
  const portalSecret = getRuntimeEnv("PORTAL_SHARED_SECRET");
  const reqSecret = request.headers.get("X-Portal-Secret");

  if (!portalSecret || !reqSecret || reqSecret !== portalSecret) {
    await logPortalAuthEvent("unknown", "verify_code", "UNAUTHORIZED", "Invalid X-Portal-Secret");
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
    await logPortalAuthEvent(email || "unknown", "verify_code", "INVALID_INPUT", "Email or 6-digit code format invalid");
    return genericInvalidError;
  }

  // 2. Rate limit verify attempts: 10 per 15 minutes per email and end-user IP
  const clientIp = request.headers.get("X-Client-IP") || request.headers.get("cf-connecting-ip") || "unknown";

  const ipAllowed = await checkDurableRateLimit(`ip:${clientIp}`, "verify_code", 10, 15);
  const emailAllowed = await checkDurableRateLimit(`email:${email}`, "verify_code", 10, 15);

  if (!ipAllowed || !emailAllowed) {
    await logPortalAuthEvent(email, "verify_code", "RATE_LIMITED", `Verification rate limit exceeded (IP: ${clientIp})`);
    return new Response(
      JSON.stringify({ error: "Too many failed attempts. Please try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const codeHash = await hmacSha256(`${code}:${email}`);

  // Query active unconsumed OTP for this email (checking both consumed and used)
  const { data: rows, error } = await supabaseAdmin
    .from("login_otps")
    .select("id, expires_at, consumed, used, attempts_count, otp_hash")
    .eq("email", email)
    .or("consumed.eq.false,used.eq.false")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error || !rows || rows.length === 0) {
    await logPortalAuthEvent(email, "verify_code", "NO_ACTIVE_CODE", "No unconsumed OTP row found");
    return genericInvalidError;
  }

  const row = rows[0];

  if ((row as any).consumed || (row as any).used) {
    await logPortalAuthEvent(email, "verify_code", "ALREADY_CONSUMED", "OTP code was already used");
    return genericInvalidError;
  }

  // Expiry check (10 minutes)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabaseAdmin.from("login_otps").update({ consumed: true, used: true } as any).eq("id", row.id);
    await logPortalAuthEvent(email, "verify_code", "EXPIRED_CODE", "OTP expired (> 10 mins)");
    return genericInvalidError;
  }

  // Maximum failed attempts check (limit 5)
  const currentAttempts = Number(row.attempts_count || 0);
  if (currentAttempts >= 5) {
    await supabaseAdmin.from("login_otps").update({ consumed: true, used: true } as any).eq("id", row.id);
    await logPortalAuthEvent(email, "verify_code", "MAX_ATTEMPTS", "5 failed attempts limit reached");
    return genericInvalidError;
  }

  // Check code HMAC hash match
  if (row.otp_hash !== codeHash) {
    const nextAttempts = currentAttempts + 1;
    const isNowConsumed = nextAttempts >= 5;
    await supabaseAdmin
      .from("login_otps")
      .update({
        attempts_count: nextAttempts,
        consumed: isNowConsumed,
        used: isNowConsumed,
      } as any)
      .eq("id", row.id);
    await logPortalAuthEvent(email, "verify_code", "INVALID_CODE", `Code mismatch (attempt ${nextAttempts}/5)`);
    return genericInvalidError;
  }

  // Restrict to active driver portal customer accounts before session exchange
  const { data: driverMatch } = await supabaseAdmin
    .from("driver_tracks")
    .select("id, active, deleted_at, auth_user_id")
    .or(`auth_user_id.neq.null,email.ilike.${email}`)
    .eq("email", email)
    .maybeSingle();

  if (driverMatch && (driverMatch.active === false || driverMatch.deleted_at)) {
    await logPortalAuthEvent(email, "verify_code", "ACCOUNT_DISABLED", "Driver profile missing or inactive");
    return genericInvalidError;
  }

  // Mark code as single-use consumed (updating both consumed and used)
  await supabaseAdmin.from("login_otps").update({ consumed: true, used: true } as any).eq("id", row.id);

  // Mint magiclink link
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    await logPortalAuthEvent(email, "verify_code", "SYSTEM_ERROR", linkErr?.message || "Failed generateLink magiclink");
    return new Response(JSON.stringify({ error: "Failed to mint login session." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Server-side exchange of token_hash for real access_token and refresh_token
  const { data: sessionRes, error: sessionErr } = await supabaseAdmin.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });

  if (sessionErr || !sessionRes.session) {
    await logPortalAuthEvent(email, "verify_code", "SYSTEM_ERROR", sessionErr?.message || "Failed verifyOtp session mint");
    return new Response(JSON.stringify({ error: "Failed to establish login session." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  await logPortalAuthEvent(email, "verify_code", "SUCCESS", "Session established successfully");

  return new Response(
    JSON.stringify({
      success: true,
      session: {
        access_token: sessionRes.session.access_token,
        refresh_token: sessionRes.session.refresh_token,
      },
      driver: {
        id: driverMatch?.id || null,
        email,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
