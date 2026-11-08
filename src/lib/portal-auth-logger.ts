export async function hashEmailForAudit(email: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const enc = new TextEncoder().encode(norm);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Steps of the driver-portal / CRM 2FA flow:
 *  request_code: secret check -> input -> rate limit -> password_check -> otp_store -> email_send
 *  verify_code:  secret check -> input -> rate limit -> code check -> session
 *  handshake:    website diagnostic secret check
 */
export type PortalAuthStep =
  | "request_code"
  | "verify_code"
  | "handshake"
  | "password_check"
  | "otp_store"
  | "email_send"
  | "session";

export async function logPortalAuthEvent(
  email: string,
  step: PortalAuthStep,
  resultCode: string,
  reason?: string,
  source: "CRM" | "Portal" = "Portal",
): Promise<void> {
  // Server log line with the specific reason (no secrets, email is hashed in the DB row).
  if (resultCode !== "SUCCESS") {
    console.warn(
      `[PortalAuth] source=${source} step=${step} result=${resultCode} reason=${(reason || "").slice(0, 300)}`,
    );
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hashedEmail = await hashEmailForAudit(email);
    const { error } = await supabaseAdmin.from("portal_auth_events" as any).insert({
      hashed_email: hashedEmail,
      step,
      result_code: resultCode,
      reason: reason ? reason.slice(0, 500) : null,
      source,
    });
    if (error) console.error("[PortalAuthEventLog] Insert rejected:", error.message);
  } catch (err) {
    console.error("[PortalAuthEventLog] Failed to log auth event:", err);
  }
}
