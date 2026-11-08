import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText } from "@/lib/meta-whatsapp.server";
import { logPortalAuthEvent } from "@/lib/portal-auth-logger";
import { render2FATemplate } from "@/lib/email-templates";
import { sendEmailDirect } from "@/lib/email-sender.server";
import { createEphemeralAuthClient } from "@/lib/supabase-ephemeral.server";
import { checkPortalSecret, jsonResponse } from "@/lib/portal-secret.server";

export async function checkDurableRateLimit(
  key: string,
  action: string,
  limit: number,
  windowMinutes = 15,
): Promise<boolean> {
  const windowAgo = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { count, error } = await supabaseAdmin
    .from("portal_rate_limits")
    .select("id", { count: "exact" })
    .eq("key", key)
    .eq("action", action)
    .gte("created_at", windowAgo);

  if (!error && count !== null && count >= limit) {
    return false;
  }

  await supabaseAdmin.from("portal_rate_limits").insert({
    key,
    action,
  });

  return true;
}

export async function hmacSha256(data: string): Promise<string> {
  const pepper = getRuntimeEnv("PORTAL_OTP_PEPPER") || "vch-default-otp-pepper-secret-2026";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const OTP_FROM = "Virtual Car Hire <auth@fa-ibi.co.uk>";

export async function sendOtpEmail(targetEmail: string, code: string) {
  const subject = `Your Virtual Car Hire verification code: ${code}`;
  const html = render2FATemplate({ code, recipientName: targetEmail.split("@")[0] || "Driver" });
  const text = `Your Virtual Car Hire verification code is: ${code}. This code expires in 10 minutes. If you didn't request this, ignore this email. Never share this code.`;

  const result = await sendEmailDirect({
    recipient: targetEmail,
    from: OTP_FROM,
    subject,
    html,
    text,
    emailType: "2fa_code",
  });

  if (result.status === "failed") {
    throw new Error(result.error || "Failed to send OTP email");
  }
}

export const Route = createFileRoute("/api/public/portal-auth/request-code")({
  server: {
    handlers: {
      POST: async ({ request }) => handleRequestCode(request),
    },
  },
});

/**
 * Internal result codes returned in the JSON `code` field (the website logs them; users see
 * friendly text only):
 *   missing_config | missing_header | secret_mismatch | invalid_input | rate_limited |
 *   invalid_credentials | account_disabled | otp_store_failed | email_send_failed | crm_internal_error
 */
export async function handleRequestCode(request: Request): Promise<Response> {
  try {
    return await handleRequestCodeInner(request);
  } catch (err: any) {
    await logPortalAuthEvent(
      "unknown",
      "request_code",
      "CRM_INTERNAL_ERROR",
      err?.message || String(err),
    );
    return jsonResponse(
      { error: "Authentication service error.", code: "crm_internal_error" },
      500,
    );
  }
}

async function handleRequestCodeInner(request: Request): Promise<Response> {
  // 1. Shared-secret handshake with the website proxy
  const secret = checkPortalSecret(request);
  if (!secret.ok) {
    await logPortalAuthEvent("unknown", "request_code", secret.code.toUpperCase(), secret.reason);
    return jsonResponse({ error: "Unauthorized", code: secret.code }, secret.status);
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request payload", code: "invalid_input" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password || email === "admin@fa-ibi.co.uk") {
    await logPortalAuthEvent(
      email || "unknown",
      "request_code",
      "INVALID_INPUT",
      "Email or password missing or forbidden email",
    );
    return jsonResponse({ error: "Invalid email or password", code: "invalid_input" }, 400);
  }

  // 2. Durable rate limiting by end-user IP (X-Client-IP) and email (5 requests / 15 mins)
  const clientIp =
    request.headers.get("X-Client-IP") || request.headers.get("cf-connecting-ip") || "unknown";
  const ipAllowed = await checkDurableRateLimit(`ip:${clientIp}`, "request_code", 5, 15);
  const emailAllowed = await checkDurableRateLimit(`email:${email}`, "request_code", 5, 15);
  if (!ipAllowed || !emailAllowed) {
    await logPortalAuthEvent(
      email,
      "request_code",
      "RATE_LIMITED",
      "IP or email rate limit exceeded",
    );
    return jsonResponse(
      { error: "Too many requests. Please try again later.", code: "rate_limited" },
      429,
    );
  }

  const invalidCredentials = () =>
    jsonResponse({ error: "Invalid email or password", code: "invalid_credentials" }, 400);

  // 3. Password check on a throwaway client (never on supabaseAdmin, see supabase-ephemeral.server.ts)
  const authClient = createEphemeralAuthClient();
  const { data: authRes, error: authErr } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (authErr || !authRes.user) {
    const status = (authErr as any)?.status;
    if (status && status >= 500) {
      await logPortalAuthEvent(
        email,
        "password_check",
        "AUTH_PROVIDER_ERROR",
        authErr?.message || "Supabase Auth 5xx",
      );
      return jsonResponse(
        { error: "Authentication service error.", code: "crm_internal_error" },
        502,
      );
    }
    await logPortalAuthEvent(
      email,
      "password_check",
      "INVALID_CREDENTIALS",
      authErr?.message || "Invalid password",
    );
    return invalidCredentials();
  }
  // Drop the user session immediately; we only needed to verify the password.
  void authClient.auth.signOut({ scope: "local" }).catch(() => {});

  // Restrict to active driver portal accounts
  const { data: driverMatch, error: driverErr } = await supabaseAdmin
    .from("driver_tracks")
    .select("id, active, deleted_at, phone")
    .or(`auth_user_id.eq.${authRes.user.id},email.ilike.${email}`)
    .limit(1)
    .maybeSingle();

  if (driverErr) {
    await logPortalAuthEvent(email, "password_check", "DRIVER_LOOKUP_FAILED", driverErr.message);
    return jsonResponse(
      { error: "Authentication service error.", code: "crm_internal_error" },
      500,
    );
  }
  if (!driverMatch || driverMatch.active === false || driverMatch.deleted_at) {
    await logPortalAuthEvent(
      email,
      "password_check",
      "ACCOUNT_DISABLED",
      "Driver profile missing, inactive, or soft-deleted",
    );
    return invalidCredentials();
  }

  // 30s resend cooldown
  const thirtySecsAgo = new Date(Date.now() - 30 * 1000).toISOString();
  const { data: recentOtps } = await supabaseAdmin
    .from("login_otps")
    .select("created_at")
    .eq("email", email)
    .gte("created_at", thirtySecsAgo);
  if (recentOtps && recentOtps.length > 0) {
    await logPortalAuthEvent(
      email,
      "request_code",
      "RATE_LIMITED",
      "30-second resend cooldown active",
    );
    return jsonResponse(
      { error: "Please wait 30 seconds before requesting another code.", code: "rate_limited" },
      429,
    );
  }

  // 4. Store the hashed code (otp_hash + code_hash for schema compatibility)
  const code = String((crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000);
  const codeHash = await hmacSha256(`${code}:${email}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("login_otps")
    .update({ consumed: true } as any)
    .eq("email", email)
    .eq("consumed", false);

  const { error: insertErr } = await supabaseAdmin.from("login_otps").insert({
    email,
    code_hash: codeHash,
    otp_hash: codeHash,
    expires_at: expiresAt,
    consumed: false,
  } as any);
  if (insertErr) {
    await logPortalAuthEvent(email, "otp_store", "OTP_STORE_FAILED", insertErr.message);
    return jsonResponse(
      { error: "Failed to issue verification code", code: "otp_store_failed" },
      500,
    );
  }

  // 5. Deliver the code: email first (auth@fa-ibi.co.uk), WhatsApp as fallback
  let deliveryMethod: "email" | "whatsapp" = "email";
  try {
    await sendOtpEmail(email, code);
  } catch (err: any) {
    const emailError = err?.message || "Email send failed";
    await logPortalAuthEvent(email, "email_send", "EMAIL_SEND_FAILED", emailError);
    const driverPhone = driverMatch.phone || authRes.user.phone || null;
    const waRes = driverPhone
      ? await sendWhatsAppText({
          phone: driverPhone,
          text: `${code} is your Virtual Car Hire portal 2FA verification code. Expires in 10 minutes.`,
        })
      : { sent: false };
    if (!waRes.sent) {
      return jsonResponse(
        {
          error: "We couldn't send your verification code. Please try again shortly.",
          code: "email_send_failed",
        },
        502,
      );
    }
    deliveryMethod = "whatsapp";
  }

  await logPortalAuthEvent(email, "request_code", "SUCCESS", `Code issued via ${deliveryMethod}`);

  return jsonResponse(
    {
      success: true,
      email,
      delivery: deliveryMethod,
      code: "ok",
      message: "Verification code sent.",
    },
    200,
  );
}
