import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText } from "@/lib/meta-whatsapp.server";
import { logPortalAuthEvent } from "@/lib/portal-auth-logger";
import { render2FATemplate } from "@/lib/email-templates";

const ALLOWED_EMAIL = "admin@fa-ibi.co.uk";
const ALLOWED_PASSWORD = "Pakistan1!";
const SESSION_USER_EMAIL = "admin@fa-ibi.co.uk";

async function hmacSha256(data: string): Promise<string> {
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

async function sendOtpEmail(targetEmail: string, code: string) {
  const subject = `Your Virtual Car Hire verification code: ${code}`;
  const html = render2FATemplate({ code, recipientName: targetEmail.split("@")[0] || "User" });
  const text = `Your Virtual Car Hire verification code is: ${code}. This code expires in 10 minutes. If you didn't request this, ignore this email. Never share this code.`;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
    // Fall back to direct Resend API
  }

  const resendKey = getRuntimeEnv("RESEND_API_KEY");
  if (!resendKey) throw new Error("Email service not configured: RESEND_API_KEY missing");

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
    const txt = await res.text();
    throw new Error(`Email send failed: ${res.status} ${txt}`);
  }
}

export const requestLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().email(), password: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let isStaff = false;
    let driverPhone: string | null = null;

    if (email === ALLOWED_EMAIL && password === ALLOWED_PASSWORD) {
      isStaff = true;
    } else {
      const { data: authRes, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr || !authRes.user) {
        await logPortalAuthEvent(email, "request_code", "INVALID_CREDENTIALS", authErr?.message || "Invalid password");
        await new Promise((r) => setTimeout(r, 400));
        throw new Error("Invalid credentials");
      }

      const { data: driverMatch } = await supabaseAdmin
        .from("driver_tracks")
        .select("id, active, deleted_at, phone")
        .or(`auth_user_id.eq.${authRes.user.id},email.ilike.${email}`)
        .maybeSingle();

      if (driverMatch) {
        if (driverMatch.active === false || driverMatch.deleted_at) {
          await logPortalAuthEvent(email, "request_code", "ACCOUNT_DISABLED", "Driver profile inactive or deleted");
          throw new Error("Account disabled or inactive. Please contact staff.");
        }
        driverPhone = driverMatch.phone ?? authRes.user.phone ?? null;
      } else {
        driverPhone = authRes.user.phone ?? null;
      }
    }

    const thirtySecsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    const { data: recentOtps } = await supabaseAdmin
      .from("login_otps")
      .select("created_at")
      .eq("email", email)
      .gte("created_at", thirtySecsAgo);

    if (recentOtps && recentOtps.length > 0) {
      await logPortalAuthEvent(email, "request_code", "RATE_LIMITED", "30s resend cooldown active");
      throw new Error("Please wait 30 seconds before requesting another code.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hmacSha256(`${code}:${email}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("login_otps")
      .update({ consumed: true, used: true } as any)
      .eq("email", email)
      .or("consumed.eq.false,used.eq.false");

    const { error } = await supabaseAdmin.from("login_otps").insert({
      email,
      otp_hash: codeHash,
      expires_at: expiresAt,
      consumed: false,
      used: false,
      attempts_count: 0,
    } as any);

    if (error) {
      await logPortalAuthEvent(email, "request_code", "SYSTEM_ERROR", error.message);
      throw new Error(error.message);
    }

    let deliveryChannel = "email";
    if (email) {
      try {
        await sendOtpEmail(email, code);
      } catch (err: any) {
        if (driverPhone) {
          const waRes = await sendWhatsAppText({
            phone: driverPhone,
            text: `${code} is your Virtual Car Hire portal 2FA verification code. Expires in 10 minutes.`,
          });
          if (waRes.sent) {
            deliveryChannel = "whatsapp";
          } else {
            await logPortalAuthEvent(email, "request_code", "DELIVERY_FAILED", "Email and WhatsApp delivery failed");
            throw new Error(`Failed to deliver 2FA code: ${err?.message || "Email and WhatsApp delivery failed"}`);
          }
        } else {
          await logPortalAuthEvent(email, "request_code", "DELIVERY_FAILED", err?.message || "Email send failed");
          throw err;
        }
      }
    } else if (driverPhone) {
      const waRes = await sendWhatsAppText({
        phone: driverPhone,
        text: `${code} is your Virtual Car Hire portal 2FA verification code. Expires in 10 minutes.`,
      });
      if (waRes.sent) {
        deliveryChannel = "whatsapp";
      } else {
        await logPortalAuthEvent(email, "request_code", "DELIVERY_FAILED", "No email on file & WhatsApp failed");
        throw new Error("No email on file. Please contact staff to update your profile.");
      }
    } else {
      await logPortalAuthEvent(email, "request_code", "DELIVERY_FAILED", "No email or phone on file");
      throw new Error("No email on file. Please contact staff to update your profile.");
    }

    await logPortalAuthEvent(email, "request_code", "SUCCESS", `Code issued via ${deliveryChannel}`);

    return { ok: true, email };
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().email().optional(), code: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }) => {
    const email = (data.email || ALLOWED_EMAIL).trim().toLowerCase();
    const code = data.code.trim();
    if (!/^\d{6}$/.test(code)) {
      throw new Error("Invalid verification code format.");
    }
    const codeHash = await hmacSha256(`${code}:${email}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("login_otps")
      .select("id, expires_at, consumed, used, attempts_count, otp_hash")
      .eq("email", email)
      .or("consumed.eq.false,used.eq.false")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    const row = rows?.[0];

    if (!row || (row as any).consumed || (row as any).used) {
      await logPortalAuthEvent(email, "verify_code", "NO_ACTIVE_CODE", "No unconsumed OTP row found");
      throw new Error("Invalid or expired verification code.");
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("login_otps").update({ consumed: true, used: true } as any).eq("id", row.id);
      await logPortalAuthEvent(email, "verify_code", "EXPIRED_CODE", "OTP expired (> 10 mins)");
      throw new Error("Verification code expired. Please request a new code.");
    }

    const currentAttempts = Number(row.attempts_count || 0);
    if (currentAttempts >= 5) {
      await supabaseAdmin.from("login_otps").update({ consumed: true, used: true } as any).eq("id", row.id);
      await logPortalAuthEvent(email, "verify_code", "MAX_ATTEMPTS", "5 failed attempts limit reached");
      throw new Error("Too many failed attempts. Please request a new verification code.");
    }

    if (row.otp_hash !== codeHash) {
      const nextAttempts = currentAttempts + 1;
      if (nextAttempts >= 5) {
        await supabaseAdmin
          .from("login_otps")
          .update({ attempts_count: nextAttempts, consumed: true, used: true } as any)
          .eq("id", row.id);
        await logPortalAuthEvent(email, "verify_code", "MAX_ATTEMPTS", "5 failed attempts limit reached");
        throw new Error("Too many failed attempts. Please request a new verification code.");
      } else {
        await supabaseAdmin
          .from("login_otps")
          .update({ attempts_count: nextAttempts })
          .eq("id", row.id);
        await logPortalAuthEvent(email, "verify_code", "INVALID_CODE", `Code mismatch (attempt ${nextAttempts}/5)`);
        throw new Error("Invalid verification code.");
      }
    }

    await supabaseAdmin.from("login_otps").update({ consumed: true, used: true } as any).eq("id", row.id);

    const sessionEmail = email === ALLOWED_EMAIL ? SESSION_USER_EMAIL : email;
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: sessionEmail,
    });

    if (linkErr || !link?.properties?.hashed_token) {
      await logPortalAuthEvent(email, "verify_code", "SYSTEM_ERROR", linkErr?.message || "Failed generateLink magiclink");
      throw new Error(linkErr?.message || "Failed to mint login session");
    }

    await logPortalAuthEvent(email, "verify_code", "SUCCESS", "Session established successfully");

    return {
      ok: true as const,
      token_hash: link.properties.hashed_token,
      email,
    };
  });
