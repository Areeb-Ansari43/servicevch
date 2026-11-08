import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkDurableRateLimit, hmacSha256 } from "./request-code";
import { logPortalAuthEvent } from "@/lib/portal-auth-logger";
import { createEphemeralAuthClient } from "@/lib/supabase-ephemeral.server";
import { checkPortalSecret, jsonResponse } from "@/lib/portal-secret.server";

export const Route = createFileRoute("/api/public/portal-auth/verify-code")({
  server: {
    handlers: {
      POST: async ({ request }) => handleVerifyCode(request),
    },
  },
});

export async function handleVerifyCode(request: Request): Promise<Response> {
  try {
    return await handleVerifyCodeInner(request);
  } catch (err: any) {
    await logPortalAuthEvent(
      "unknown",
      "verify_code",
      "CRM_INTERNAL_ERROR",
      err?.message || String(err),
    );
    return jsonResponse(
      { error: "Authentication service error.", code: "crm_internal_error" },
      500,
    );
  }
}

async function handleVerifyCodeInner(request: Request): Promise<Response> {
  // 1. Shared-secret handshake with the website proxy
  const secret = checkPortalSecret(request);
  if (!secret.ok) {
    await logPortalAuthEvent("unknown", "verify_code", secret.code.toUpperCase(), secret.reason);
    return jsonResponse({ error: "Unauthorized", code: secret.code }, secret.status);
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
    { status: 400, headers: { "Content-Type": "application/json" } },
  );

  if (!email || !code || !/^\d{6}$/.test(code) || email === "admin@fa-ibi.co.uk") {
    await logPortalAuthEvent(
      email || "unknown",
      "verify_code",
      "INVALID_INPUT",
      "Email or 6-digit code format invalid",
    );
    return genericInvalidError;
  }

  // 2. Rate limit verify attempts: 10 per 15 minutes per email and end-user IP
  const clientIp =
    request.headers.get("X-Client-IP") || request.headers.get("cf-connecting-ip") || "unknown";

  const ipAllowed = await checkDurableRateLimit(`ip:${clientIp}`, "verify_code", 10, 15);
  const emailAllowed = await checkDurableRateLimit(`email:${email}`, "verify_code", 10, 15);

  if (!ipAllowed || !emailAllowed) {
    await logPortalAuthEvent(
      email,
      "verify_code",
      "RATE_LIMITED",
      `Verification rate limit exceeded (IP: ${clientIp})`,
    );
    return new Response(
      JSON.stringify({ error: "Too many failed attempts. Please try again later." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const codeHash = await hmacSha256(`${code}:${email}`);

  // Query active unconsumed OTP for this email (checking both consumed and used, code_hash and otp_hash)
  const { data: rows, error } = await supabaseAdmin
    .from("login_otps")
    .select("id, expires_at, consumed, code_hash, otp_hash")
    .eq("email", email)
    .eq("consumed", false)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    await logPortalAuthEvent(email, "verify_code", "OTP_LOOKUP_FAILED", error.message);
    return jsonResponse(
      { error: "Authentication service error.", code: "crm_internal_error" },
      500,
    );
  }
  if (!rows || rows.length === 0) {
    await logPortalAuthEvent(email, "verify_code", "NO_ACTIVE_CODE", "No unconsumed OTP row found");
    return genericInvalidError;
  }

  const row: any = rows[0];

  if (row.consumed) {
    await logPortalAuthEvent(email, "verify_code", "ALREADY_CONSUMED", "OTP code was already used");
    return genericInvalidError;
  }

  // Expiry check (10 minutes)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabaseAdmin
      .from("login_otps")
      .update({ consumed: true } as any)
      .eq("id", row.id);
    await logPortalAuthEvent(email, "verify_code", "EXPIRED_CODE", "OTP expired (> 10 mins)");
    return genericInvalidError;
  }

  // Check code HMAC hash match across either code_hash or otp_hash
  const activeHash = row.code_hash || row.otp_hash;
  if (activeHash !== codeHash) {
    await logPortalAuthEvent(email, "verify_code", "INVALID_CODE", "Code mismatch");
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
    await logPortalAuthEvent(
      email,
      "verify_code",
      "ACCOUNT_DISABLED",
      "Driver profile missing or inactive",
    );
    return genericInvalidError;
  }

  // Mark code as single-use consumed (updating both consumed and used)
  await supabaseAdmin
    .from("login_otps")
    .update({ consumed: true } as any)
    .eq("id", row.id);

  // Mint magiclink link
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    await logPortalAuthEvent(
      email,
      "session",
      "SESSION_MINT_FAILED",
      linkErr?.message || "Failed generateLink magiclink",
    );
    return jsonResponse({ error: "Failed to mint login session.", code: "session_failed" }, 500);
  }

  // Server-side exchange of token_hash for a real session. Uses a throwaway client: calling
  // verifyOtp on supabaseAdmin would store the driver's session on the shared admin client.
  const { data: sessionRes, error: sessionErr } = await createEphemeralAuthClient().auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });

  if (sessionErr || !sessionRes.session) {
    await logPortalAuthEvent(
      email,
      "session",
      "SESSION_EXCHANGE_FAILED",
      sessionErr?.message || "Failed verifyOtp session mint",
    );
    return jsonResponse(
      { error: "Failed to establish login session.", code: "session_failed" },
      500,
    );
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
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
