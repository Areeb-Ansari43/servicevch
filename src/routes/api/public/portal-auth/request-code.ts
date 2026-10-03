import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendWhatsAppText } from "@/lib/meta-whatsapp.server";

// In-memory rate limiting store for external API requests
const requestIpStore = new Map<string, number[]>();

export function checkRateLimit(ip: string, limit = 5, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const timestamps = (requestIpStore.get(ip) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) return false;
  timestamps.push(now);
  requestIpStore.set(ip, timestamps);
  return true;
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const OTP_FROM = "Virtual Car Hire <auth@fa-ibi.co.uk>";

export async function sendOtpEmail(targetEmail: string, code: string) {
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

  // Try edge function first
  try {
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
  // Secret verification
  const portalSecret = getRuntimeEnv("PORTAL_SHARED_SECRET");
  const reqSecret = request.headers.get("X-Portal-Secret");

  if (!portalSecret || !reqSecret || reqSecret !== portalSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // IP rate limiting
  const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
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
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return new Response(JSON.stringify({ error: "Invalid email or password" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Restrict staff accounts from using portal endpoints
  if (email === "admin@fa-ibi.co.uk") {
    return new Response(JSON.stringify({ error: "Invalid email or password" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const genericAuthError = new Response(JSON.stringify({ error: "Invalid email or password" }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });

  // Verify driver credentials via Supabase Auth
  const { data: authRes, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
    email,
    password,
  });

  if (authErr || !authRes.user) {
    return genericAuthError;
  }

  // Restrict to portal driver accounts linked to an active, non-deleted driver_tracks row
  const { data: driverMatch } = await supabaseAdmin
    .from("driver_tracks")
    .select("id, active, deleted_at, phone")
    .or(`auth_user_id.eq.${authRes.user.id},email.ilike.${email}`)
    .maybeSingle();

  if (!driverMatch || driverMatch.active === false || driverMatch.deleted_at) {
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
    return new Response(
      JSON.stringify({ error: "Please wait 30 seconds before requesting another code." }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await sha256(`${email}:${code}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabaseAdmin
    .from("login_otps")
    .update({ consumed: true })
    .eq("email", email)
    .eq("consumed", false);

  const { error: insertErr } = await supabaseAdmin.from("login_otps").insert({
    email,
    code_hash: codeHash,
    expires_at: expiresAt,
    consumed: false,
    attempts_count: 0,
  } as any);

  if (insertErr) {
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
