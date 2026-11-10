import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendTelegramAlert } from "@/lib/telegram.server";

export const VCH_HEADER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-header.png";
export const VCH_FOOTER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-footer.png";

/**
 * Every outbound email MUST be sent from the verified fa-ibi.co.uk domain.
 * This is an allowlist (not a blocklist) so a mis-set env var can never route mail
 * through a sandbox sender such as Resend's shared onboarding address.
 * Enforced again by src/lib/email-sender-domain.test.ts across the whole repo.
 */
export const ALLOWED_SENDER_DOMAIN = "fa-ibi.co.uk";
export const SENDER_DISPLAY_NAME = "Virtual Car Hire";

export const DEFAULT_SENDERS = {
  auth: "auth@fa-ibi.co.uk",
  notifications: "notifications@fa-ibi.co.uk",
  driverAlerts: "driver-alerts@fa-ibi.co.uk",
} as const;

const PROHIBITED_RECIPIENT_ADDRESSES = [
  "notifications@fa-ibi.co.uk",
  "auth@fa-ibi.co.uk",
  "driver-alerts@fa-ibi.co.uk",
];

/**
 * Every email the CRM sends (staff digests, rent-due reminders, driver alerts, 2FA codes) is
 * flagged high importance, as requested by the business owner.
 */
export const HIGH_IMPORTANCE_HEADERS = {
  Importance: "high",
  "X-Priority": "1",
  "X-MSMail-Priority": "High",
} as const;

let lastTelegramAlertTime = 0;

export interface SendEmailOptions {
  to?: string;
  recipient?: string;
  subject: string;
  html: string;
  text?: string;
  emailType?: string;
  template_type?: string;
  from?: string;
  skip?: boolean;
  skipReason?: string;
  metadata?: Record<string, any>;
}

export interface SendEmailResult {
  success: boolean;
  status: "sent" | "failed" | "skipped";
  id?: string;
  sender?: string;
  error?: string;
  /** False when the email_log row could not be written (send itself may still have succeeded). */
  logged?: boolean;
  logError?: string;
}

/** Extracts the bare address from "Name <addr>" or "addr". */
export function extractAddress(raw: string): string {
  const trimmed = (raw || "").trim();
  const m = trimmed.match(/<([^>]+)>/);
  return (m ? m[1] : trimmed).trim().toLowerCase();
}

export function isAllowedSender(raw: string): boolean {
  const address = extractAddress(raw);
  const at = address.lastIndexOf("@");
  if (at < 1) return false;
  return address.slice(at + 1) === ALLOWED_SENDER_DOMAIN;
}

/** Always returns `Virtual Car Hire <address>` regardless of any display name passed in. */
export function formatFromAddress(rawAddress: string): string {
  return `${SENDER_DISPLAY_NAME} <${extractAddress(rawAddress)}>`;
}

export function assertAllowedSender(raw: string): string {
  if (!isAllowedSender(raw)) {
    throw new Error(
      `Sender '${extractAddress(raw) || "(empty)"}' is not allowed. All email must be sent from @${ALLOWED_SENDER_DOMAIN}.`,
    );
  }
  return formatFromAddress(raw);
}

/** Reads an optional env override, ignoring (and warning about) anything off-domain. */
function senderOverride(name: string): string | undefined {
  const value = getRuntimeEnv(name) || process.env[name];
  if (!value) return undefined;
  if (!isAllowedSender(value)) {
    console.warn(
      `[email-sender] Ignoring env ${name}: sender must be on @${ALLOWED_SENDER_DOMAIN}.`,
    );
    return undefined;
  }
  return value;
}

export function getDefaultFromAddress(type: string): string {
  let address: string;
  if (type === "2fa" || type === "2fa_code") {
    address = senderOverride("AUTH_EMAIL_FROM") || DEFAULT_SENDERS.auth;
  } else if (
    type === "fleet_summary" ||
    type === "driver_licence_summary" ||
    type === "rent_due" ||
    type === "rent_due_tomorrow" ||
    type === "odometer_submission"
  ) {
    address = senderOverride("NOTIFICATIONS_EMAIL_FROM") || DEFAULT_SENDERS.notifications;
  } else {
    address = senderOverride("DRIVER_ALERTS_EMAIL_FROM") || DEFAULT_SENDERS.driverAlerts;
  }
  return assertAllowedSender(address);
}

type LogResult = { logged: boolean; logError?: string };

async function safeLogEmail(payload: {
  recipient: string;
  subject: string;
  type: string;
  status: "sent" | "failed" | "skipped";
  error_message?: string;
  metadata?: Record<string, any>;
}): Promise<LogResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("email_log").insert({
      recipient: payload.recipient,
      subject: payload.subject,
      type: payload.type,
      status: payload.status,
      error_message: payload.error_message || null,
      metadata: payload.metadata || {},
    });
    if (error) {
      console.warn("[email-sender] email_log insert rejected:", error.message);
      return { logged: false, logError: error.message };
    }
    return { logged: true };
  } catch (err: any) {
    console.warn("[email-sender] Failed to insert email_log record:", err?.message || err);
    return { logged: false, logError: err?.message || String(err) };
  }
}

async function triggerFailureTelegramAlert(type: string, recipient: string, errorMsg: string) {
  const now = Date.now();
  if (now - lastTelegramAlertTime < 30 * 60 * 1000) {
    console.info("[email-sender] Telegram alert suppressed (rate limited: 1 per 30 mins)");
    return;
  }
  lastTelegramAlertTime = now;

  const alertText = `🚨 <b>Email Delivery Failure Alert</b>\n\n<b>Type:</b> ${type}\n<b>Recipient:</b> ${recipient}\n<b>Error:</b> ${errorMsg}`;
  try {
    await sendTelegramAlert(alertText);
  } catch (err) {
    console.warn("[email-sender] Telegram alert failed:", err);
  }
}

/**
 * The ONE outbound email path for the CRM. Every send (cron digests, test buttons,
 * 2FA codes, driver notices) goes through here so that:
 *  - the From address is always `Virtual Car Hire <...@fa-ibi.co.uk>`
 *  - staff compliance digests carry high-importance headers
 *  - every attempt (sent / failed / skipped) is written to email_log
 */
export async function sendEmailDirect(options: SendEmailOptions): Promise<SendEmailResult> {
  const rawRecipient = options.recipient || options.to || "";
  const recipient = typeof rawRecipient === "string" ? rawRecipient.trim().toLowerCase() : "";
  const subject = options.subject || "Virtual Car Hire Notice";
  const emailType = options.emailType || options.template_type || "driver_alert";
  const metadata = options.metadata || {};

  const fail = async (
    errorMsg: string,
    sender?: string,
    alert = true,
  ): Promise<SendEmailResult> => {
    const log = await safeLogEmail({
      recipient: recipient || "none",
      subject,
      type: emailType,
      status: "failed",
      error_message: errorMsg,
      metadata: sender ? { ...metadata, sender } : metadata,
    });
    if (alert) await triggerFailureTelegramAlert(emailType, recipient, errorMsg);
    return { success: false, status: "failed", sender, error: errorMsg, ...log };
  };

  // 1. Skipped send (e.g. driver has no email on file)
  if (!recipient || recipient === "none" || options.skip) {
    const skipReason = options.skipReason || "Driver has no email address on file";
    const log = await safeLogEmail({
      recipient: recipient || "none",
      subject,
      type: emailType,
      status: "skipped",
      error_message: skipReason,
      metadata,
    });
    return { success: true, status: "skipped", error: skipReason, ...log };
  }

  // 2. Never send to our own sender mailboxes
  if (PROHIBITED_RECIPIENT_ADDRESSES.includes(recipient)) {
    return fail(
      `Sending email to internal sender address (${recipient}) is prohibited. Staff alerts must go to admin@fa-ibi.co.uk.`,
    );
  }

  // 3. Sender resolution: fa-ibi.co.uk allowlist only
  let senderAddress = "";
  try {
    senderAddress = options.from
      ? assertAllowedSender(options.from)
      : getDefaultFromAddress(emailType);
  } catch (err: any) {
    return fail(err?.message || "Invalid sender address");
  }

  // 4. Resend API key
  const resendApiKey = getRuntimeEnv("RESEND_API_KEY") || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    return fail("RESEND_API_KEY environment variable is missing.", senderAddress);
  }

  // 5. Send via Resend
  const emailHeaders = { ...HIGH_IMPORTANCE_HEADERS };

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: senderAddress,
        to: [recipient],
        subject,
        html: options.html,
        text: options.text || undefined,
        headers: emailHeaders,
      }),
    });

    let resendData: any = {};
    try {
      resendData = await resendRes.json();
    } catch {
      resendData = {};
    }

    if (!resendRes.ok) {
      const errorDetail = resendData.message || resendData.error || `HTTP ${resendRes.status}`;
      return fail(`Resend API error (${resendRes.status}): ${errorDetail}`, senderAddress);
    }

    const log = await safeLogEmail({
      recipient,
      subject,
      type: emailType,
      status: "sent",
      metadata: { ...metadata, resend_id: resendData.id, sender: senderAddress },
    });

    return { success: true, status: "sent", id: resendData.id, sender: senderAddress, ...log };
  } catch (err: any) {
    return fail(err?.message || "Network exception during email send", senderAddress);
  }
}
