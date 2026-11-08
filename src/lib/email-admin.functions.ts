import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Staff-only server functions used by the Settings page:
 *  - sendTestEmailFn:    the 5 "Send Test Email" buttons
 *  - runExpiryScanNowFn: the "Run Expiry Scan Now" button
 *
 * Both run on the server and use the single unified sending path (sendEmailDirect),
 * which enforces the fa-ibi.co.uk sender and writes email_log.
 */

export const TEST_EMAIL_KINDS = [
  "2fa_code",
  "fleet_summary",
  "driver_licence_summary",
  "rent_due_tomorrow",
  "driver_alert",
] as const;
export type TestEmailKind = (typeof TEST_EMAIL_KINDS)[number];

export interface TestEmailResult {
  ok: boolean;
  kind: TestEmailKind;
  recipient: string;
  sender?: string;
  resendId?: string;
  error?: string;
  /** Whether the email_log row was written. */
  logged: boolean;
  logError?: string;
}

/** Resolves the caller's own email and refuses driver-portal accounts. */
async function resolveStaffEmail(context: { userId: string; claims: any }): Promise<string> {
  const email =
    typeof context.claims?.email === "string" ? context.claims.email.trim().toLowerCase() : "";
  if (!email)
    throw new Error("Your session has no email address. Sign out and back in, then try again.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: driverRow } = await supabaseAdmin
    .from("driver_tracks")
    .select("id")
    .eq("auth_user_id", context.userId)
    .limit(1);
  if (driverRow && driverRow.length > 0) {
    throw new Error("Driver portal accounts cannot use CRM admin tools.");
  }
  return email;
}

export const sendTestEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(TEST_EMAIL_KINDS) }).parse(d))
  .handler(async ({ data, context }): Promise<TestEmailResult> => {
    let recipient = "";
    try {
      recipient = await resolveStaffEmail(context as any);
      const { buildTestEmail } = await import("@/lib/email-test-samples.server");
      const { sendEmailDirect } = await import("@/lib/email-sender.server");
      const msg = await buildTestEmail(data.kind, recipient);
      const res = await sendEmailDirect({
        recipient,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        emailType: data.kind,
        metadata: { test: true, triggered_by: context.userId },
      });
      return {
        ok: res.status === "sent",
        kind: data.kind,
        recipient,
        sender: res.sender,
        resendId: res.id,
        error: res.status === "sent" ? undefined : res.error,
        logged: res.logged ?? false,
        logError: res.logError,
      };
    } catch (err: any) {
      return {
        ok: false,
        kind: data.kind,
        recipient,
        error: err?.message || String(err),
        logged: false,
      };
    }
  });

export const runExpiryScanNowFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveStaffEmail(context as any);
    const { runExpiryScan } = await import("@/lib/expiry-scan.server");
    const result = await runExpiryScan({ trigger: "manual", force: true });
    return { ...result, skipped: result.skippedEmails };
  });

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Driver reminder email ("Send reminder" in the Drivers view). The recipient is looked up
 * server-side from driver_tracks, never taken from the browser.
 */
export const sendDriverNoticeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        driverId: z.string().min(1),
        title: z.string().min(1).max(200),
        message: z.string().min(1).max(4000),
        reminderType: z.string().max(50).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await resolveStaffEmail(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: driver, error } = await supabaseAdmin
      .from("driver_tracks")
      .select("id, driver_name, email, reg")
      .eq("id", data.driverId)
      .maybeSingle();
    if (error || !driver) {
      return { ok: false, status: "failed" as const, error: error?.message || "Driver not found" };
    }

    const { renderDriverAlertTemplate } = await import("@/lib/email-templates");
    const { sendEmailDirect } = await import("@/lib/email-sender.server");
    const { DRIVER_PORTAL_URL } = await import("@/lib/domain-config");
    const driverEmail = (driver as any).email?.trim() || "";

    const html = renderDriverAlertTemplate({
      recipientName: (driver as any).driver_name,
      headline: escapeHtml(data.title),
      subtext: escapeHtml(data.message).replace(/\n/g, "<br />"),
      actionUrl: DRIVER_PORTAL_URL,
      actionText: "Log in to Driver Portal",
    });

    const res = await sendEmailDirect({
      recipient: driverEmail || "none",
      skip: !driverEmail,
      skipReason: `Driver ${(driver as any).driver_name} has no email address on file`,
      subject: `Virtual Car Hire: ${data.title}`,
      emailType: "driver_alert",
      html,
      text: `${data.title}\n\n${data.message}\n\n${DRIVER_PORTAL_URL}`,
      metadata: {
        driver_id: (driver as any).id,
        reminder_type: data.reminderType ?? null,
        triggered_by: context.userId,
      },
    });
    return { ok: res.status !== "failed", status: res.status, error: res.error };
  });
