import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText } from "@/lib/meta-whatsapp.server";

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
  const subject = `${code} is your VCH verification code`;
  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
  </head>
  <body style="margin:0;padding:0;background:#07070b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07070b;padding:36px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#101018;border:1px solid rgba(255,106,0,.22);border-radius:20px;padding:34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding-bottom:26px;">
                <span style="display:inline-block;font-size:15px;font-weight:700;color:#ffffff;">Virtual Car Hire</span>
                <span style="display:inline-block;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ff6a00;padding-left:8px;">Portal Access</span>
              </td>
            </tr>
            <tr>
              <td style="font-size:18px;line-height:1.5;color:#f4f4f6;font-weight:600;padding-bottom:20px;">
                Here's your verification code.
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#17171f;border:1px solid rgba(255,106,0,.32);border-radius:14px;padding:24px 12px;">
                <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:.24em;color:#ff8a2b;">${code}</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="font-size:13px;color:#9a9aa6;padding-top:16px;">
                This code expires in 10 minutes.
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid rgba(255,255,255,.08);padding-top:18px;font-size:12px;line-height:1.5;color:#74747f;">
                If you didn't request this, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: edgeRes, error: edgeErr } = await supabaseAdmin.functions.invoke("send-email", {
      body: {
        to: targetEmail,
        subject,
        html,
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
      throw new Error("Please wait 30 seconds before requesting another code.");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await hmacSha256(`${code}:${email}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await supabaseAdmin
      .from("login_otps")
      .update({ consumed: true })
      .eq("email", email)
      .eq("consumed", false);

    const { error } = await supabaseAdmin.from("login_otps").insert({
      email,
      otp_hash: codeHash,
      expires_at: expiresAt,
      consumed: false,
      attempts_count: 0,
    } as any);

    if (error) throw new Error(error.message);

    if (email) {
      try {
        await sendOtpEmail(email, code);
      } catch (err: any) {
        if (driverPhone) {
          const waRes = await sendWhatsAppText({
            phone: driverPhone,
            text: `${code} is your Virtual Car Hire portal 2FA verification code. Expires in 10 minutes.`,
          });
          if (!waRes.sent) {
            throw new Error(`Failed to deliver 2FA code: ${err?.message || "Email and WhatsApp delivery failed"}`);
          }
        } else {
          throw err;
        }
      }
    } else if (driverPhone) {
      const waRes = await sendWhatsAppText({
        phone: driverPhone,
        text: `${code} is your Virtual Car Hire portal 2FA verification code. Expires in 10 minutes.`,
      });
      if (!waRes.sent) {
        throw new Error("No email on file. Please contact staff to update your profile.");
      }
    } else {
      throw new Error("No email on file. Please contact staff to update your profile.");
    }

    return { ok: true, email };
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ email: z.string().email().optional(), code: z.string().regex(/^\d{6}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const email = (data.email || ALLOWED_EMAIL).trim().toLowerCase();
    const codeHash = await hmacSha256(`${data.code}:${email}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("login_otps")
      .select("id, expires_at, consumed, attempts_count, otp_hash")
      .eq("email", email)
      .eq("consumed", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    const row = rows?.[0];

    if (!row) {
      throw new Error("Invalid or expired verification code.");
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);
      throw new Error("Verification code expired. Please request a new code.");
    }

    const currentAttempts = Number(row.attempts_count || 0);
    if (currentAttempts >= 5) {
      await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);
      throw new Error("Too many failed attempts. Please request a new verification code.");
    }

    if (row.otp_hash !== codeHash) {
      const nextAttempts = currentAttempts + 1;
      if (nextAttempts >= 5) {
        await supabaseAdmin
          .from("login_otps")
          .update({ attempts_count: nextAttempts, consumed: true })
          .eq("id", row.id);
        throw new Error("Too many failed attempts. Please request a new verification code.");
      } else {
        await supabaseAdmin
          .from("login_otps")
          .update({ attempts_count: nextAttempts })
          .eq("id", row.id);
        throw new Error("Invalid verification code.");
      }
    }

    await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);

    const sessionEmail = email === ALLOWED_EMAIL ? SESSION_USER_EMAIL : email;
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: sessionEmail,
    });

    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(linkErr?.message || "Failed to mint login session");
    }

    return {
      ok: true as const,
      token_hash: link.properties.hashed_token,
      email,
    };
  });
