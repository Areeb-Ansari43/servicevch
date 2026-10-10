import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText } from "@/lib/meta-whatsapp.server";
import { logPortalAuthEvent } from "@/lib/portal-auth-logger";
import { render2FATemplate } from "@/lib/email-templates";

export async function checkDurableRateLimit(
  key: string,
  action: string,
  limit: number,
  windowMinutes = 15
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
    ["sign"]
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

  try {
    const { data: edgeRes, error: edgeErr } = await supabaseAdmin.functions.invoke("send-email", {
      body: {
        to: targetEmail,
        recipient: targetEmail,
        from: OTP_FROM,
        subject,
        html,
        text,
        email_type: "2fa_code",
      },
    });

    if (!edgeErr && edgeRes && edgeRes.status !== "failed") {
      return;
    }
  } catch {
    // Fall back to direct Resend API call
  }

  const resendKey = getRuntimeEnv("RESEND_API_KEY");
  if (!resendKey) throw new Error("RESEND_API_KEY missing");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: OTP_FROM,
      to: [targetEmail],
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error(`Email send failed with status ${res.status}`);
  }
}

export const Route = createFileRoute("/api/public/portal-auth/request-code")({
  server: {
    handlers: {
      POST: async ({ request }) => handleRequestCode(request),
    },
  },
});

export async function handleRequestCode(request: Request): Promise<Response> {
  // 1. Secret verification
  const portalSecret = getRuntimeEnv("PORTAL_SHARED_SECRET");
  const reqSecret = request.headers.get("X-Portal-Secret");

  if (!portalSecret || !reqSecret || reqSecret !== portalSecret) {
    await logPortalAuthEvent("unknown", "request_code", "UNAUTHORIZED", "Invalid X-Portal-Secret");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse body
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
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password || email === "admin@fa-ibi.co.uk") {
    await logPortalAuthEvent(email || "unknown", "request_code", "INVALID_INPUT", "Email or password missing or forbidden email");
    return new Response(JSON.stringify({ error: "Invalid email or password" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Durable rate limiting by End-User IP (X-Client-IP) and Email (5 requests / 15 mins)
  const clientIp = request.headers.get("X-Client-IP") || request.headers.get("cf-connecting-ip") || "unknown";

  const ipAllowed = await checkDurableRateLimit(`ip:${clientIp}`, "request_code", 5, 15);
  const emailAllowed = await checkDurableRateLimit(`email:${email}`, "request_code", 5, 15);

  if (!ipAllowed || !emailAllowed) {
    await logPortalAuthEvent(email, "request_code", "RATE_LIMITED", `IP or email rate limit exceeded (IP: ${clientIp})`);
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const genericAuthError = new Response(JSON.stringify({ error: "Invalid email or password" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

  // 3. Verify driver credentials via Supabase Auth
  const { data: authRes, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authRes.user) {
    await logPortalAuthEvent(email, "request_code", "INVALID_CREDENTIALS", authErr?.message || "Invalid password");
    return genericAuthError;
  }

  // Restrict to active driver portal customer accounts
  const { data: driverMatch } = await supabaseAdmin
    .from("driver_tracks")
    .select("id, active, deleted_at, phone")
    .or(`auth_user_id.eq.${authRes.user.id},email.ilike.${email}`)
    .maybeSingle();

  if (!driverMatch || driverMatch.active === false || driverMatch.deleted_at) {
    await logPortalAuthEvent(email, "request_code", "ACCOUNT_DISABLED", "Driver profile missing, inactive, or soft-deleted");
    return genericAuthError;
  }

  // Check 30s resend cooldown
  const thirtySecsAgo = new Date(Date.now() - 30 * 1000).toISOString();
  const { data: recentOtps } = await supabaseAdmin
    .from("login_otps")
    .select("created_at")
    .eq("email", email)
    .gte("created_at", thirtySecsAgo);

  if (recentOtps && recentOtps.length > 0) {
    await logPortalAuthEvent(email, "request_code", "RATE_LIMITED", "30-second resend cooldown active");
    return new Response(
      JSON.stringify({ error: "Please wait 30 seconds before requesting another code." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await hmacSha256(`${code}:${email}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Invalidate all earlier unconsumed codes for this email (updating both consumed and used for DB compatibility)
  await supabaseAdmin
    .from("login_otps")
    .update({ consumed: true, used: true } as any)
    .eq("email", email)
    .or("consumed.eq.false,used.eq.false");

  const { error: insertErr } = await supabaseAdmin.from("login_otps").insert({
    email,
    otp_hash: codeHash,
    expires_at: expiresAt,
    consumed: false,
    used: false,
    attempts_count: 0,
  } as any);

  if (insertErr) {
    await logPortalAuthEvent(email, "request_code", "SYSTEM_ERROR", insertErr.message);
    return new Response(JSON.stringify({ error: "Failed to issue verification code" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let deliveryMethod: "email" | "whatsapp" | "unsupported" = "email";
  const driverPhone = driverMatch.phone || authRes.user.phone || null;

  try {
    await sendOtpEmail(email, code);
  } catch {
    if (driverPhone) {
      const waRes = await sendWhatsAppText({
        phone: driverPhone,
        text: `${code} is your Virtual Car Hire portal 2FA verification code. Expires in 10 minutes.`,
      });
      if (waRes.sent) {
        deliveryMethod = "whatsapp";
      } else {
        deliveryMethod = "unsupported";
      }
    } else {
      deliveryMethod = "unsupported";
    }
  }

  await logPortalAuthEvent(email, "request_code", "SUCCESS", `Code issued via ${deliveryMethod}`);

  return new Response(
    JSON.stringify({
      success: true,
      email,
      delivery: deliveryMethod,
      message: deliveryMethod === "unsupported"
        ? "No registered delivery channel available. Please contact support."
        : "Verification code sent.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
