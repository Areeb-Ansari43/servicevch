export async function hashEmailForAudit(email: string): Promise<string> {
  const norm = email.trim().toLowerCase();
  const enc = new TextEncoder().encode(norm);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function logPortalAuthEvent(
  email: string,
  step: "request_code" | "verify_code",
  resultCode: string,
  reason?: string
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hashedEmail = await hashEmailForAudit(email);
    await supabaseAdmin.from("portal_auth_events" as any).insert({
      hashed_email: hashedEmail,
      step,
      result_code: resultCode,
      reason: reason || null,
    });
  } catch (err) {
    console.error("[PortalAuthEventLog] Failed to log auth event:", err);
  }
}
