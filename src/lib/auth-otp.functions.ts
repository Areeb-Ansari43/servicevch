import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ALLOWED_EMAIL = "admin@fa-ibi.co.uk";
const ALLOWED_PASSWORD = "Pakistan1!";

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const OTP_DELIVERY_EMAIL = "admin@fa-ibi.co.uk";
const OTP_FROM = "Virtual Car Hire <admin@fa-ibi.co.uk>";

async function sendOtpEmail(_email: string, code: string) {
  const email = OTP_DELIVERY_EMAIL;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) throw new Error("Email service not configured");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0f1115;color:#fff;border-radius:12px">
      <div style="font-weight:700;color:#ff6a00;font-size:14px;letter-spacing:.18em;text-transform:uppercase">Virtual Car Hire</div>
      <h1 style="font-size:22px;margin:8px 0 16px">Your sign-in code</h1>
      <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 16px">Use this 6-digit code to complete sign-in to Fleet Tracker. It expires in 10 minutes.</p>
      <div style="font-size:38px;font-weight:800;letter-spacing:.4em;background:#1a1d24;color:#ff6a00;padding:18px 24px;border-radius:10px;text-align:center;font-family:ui-monospace,monospace">${code}</div>
      <p style="color:#64748b;font-size:12px;margin:18px 0 0">If you didn't request this, ignore this email.</p>
    </div>`;

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

async function ensureAuthUser(supabaseAdmin: any) {
  // Find or create the allowed auth user so magiclink can be minted for it.
  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users?.find((u: any) => (u.email ?? "").toLowerCase() === ALLOWED_EMAIL);
  if (existing) return existing;
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: ALLOWED_EMAIL,
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
  return created.user;
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

    await ensureAuthUser(supabaseAdmin);

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: ALLOWED_EMAIL,
    });
    if (linkErr || !link?.properties?.hashed_token) throw new Error(linkErr?.message || "Failed to mint session");

    return {
      ok: true as const,
      token_hash: link.properties.hashed_token,
      email: ALLOWED_EMAIL,
    };
  });
