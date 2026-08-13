import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_EMAIL = "admin@fa-ibi.co.uk";
const ALLOWED_PASSWORD = "Pakistan1!";
// Existing Supabase auth user that owns all fleet data. Login credentials are admin@,
// but the session is minted for this account so data ownership stays intact.
const SESSION_USER_EMAIL = "admin@fa-ibi.co.uk";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const OTP_DELIVERY_EMAIL = "admin@fa-ibi.co.uk";
// NOTE: fa-ibi.co.uk is not yet verified in Resend, so we send from Resend's
// shared verified sender. Once the domain is verified in Resend, switch this
// back to "Virtual Car Hire <admin@fa-ibi.co.uk>".
const OTP_FROM = "Virtual Car Hire <onboarding@resend.dev>";

async function sendOtpEmail(_email: string, code: string) {
  const email = OTP_DELIVERY_EMAIL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("Email service not configured: RESEND_API_KEY missing");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light dark" />
    <meta name="supported-color-schemes" content="light dark" />
  </head>
  <body style="margin:0;padding:0;background:#f5f5f7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#ffffff;border-radius:16px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <tr>
              <td style="padding-bottom:24px;">
                <span style="display:inline-block;font-size:15px;font-weight:700;color:#111111;">Virtual Car Hire</span>
                <span style="display:inline-block;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#ff6a00;padding-left:8px;">Fleet Tracker</span>
              </td>
            </tr>
            <tr>
              <td style="font-size:17px;line-height:1.5;color:#111111;padding-bottom:20px;">
                Here's your verification code.
              </td>
            </tr>
            <tr>
              <td align="center" style="background:#f2f2f4;border-radius:12px;padding:22px 12px;">
                <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:.22em;color:#111111;">${code}</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="font-size:13px;color:#6e6e73;padding-top:14px;">
                This code expires in 10 minutes.
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5e5ea;margin-top:24px;padding-top:18px;font-size:12px;line-height:1.5;color:#8e8e93;">
                If you didn't request this, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;


  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("Email service not configured: LOVABLE_API_KEY missing");

  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: OTP_FROM,
      to: [email],
      subject: `${code} is your VCH Fleet Tracker code`,
      html,
    }),
  });


  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Email send failed: ${res.status} ${txt}`);
  }
}


export const requestLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email(), password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const password = data.password.trim();
    if (email !== ALLOWED_EMAIL || password !== ALLOWED_PASSWORD) {
      await new Promise((r) => setTimeout(r, 400));
      throw new Error("Invalid credentials");
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256(`${ALLOWED_EMAIL}:${code}`);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("email", ALLOWED_EMAIL).eq("consumed", false);

    const { error } = await supabaseAdmin.from("login_otps").insert({
      email: ALLOWED_EMAIL,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    await sendOtpEmail(ALLOWED_EMAIL, code);
    return { ok: true };
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data }) => {
    const codeHash = await sha256(`${ALLOWED_EMAIL}:${data.code}`);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("login_otps")
      .select("id, expires_at, consumed")
      .eq("email", ALLOWED_EMAIL)
      .eq("code_hash", codeHash)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) throw new Error("Invalid code");
    if (row.consumed) throw new Error("Code already used");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("Code expired");

    await supabaseAdmin.from("login_otps").update({ consumed: true }).eq("id", row.id);

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: SESSION_USER_EMAIL,
    });
    if (linkErr || !link?.properties?.hashed_token) throw new Error(linkErr?.message || "Failed to mint session");

    return {
      ok: true as const,
      token_hash: link.properties.hashed_token,
      email: ALLOWED_EMAIL,
    };
  });
