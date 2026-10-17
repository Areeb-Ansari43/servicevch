import { getRuntimeEnv } from "@/integrations/supabase/config";
import { sendTelegramAlert } from "@/lib/telegram.server";

export const VCH_HEADER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-header.png";
export const VCH_FOOTER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-footer.png";

const PROHIBITED_DOMAINS = ["resend.dev", "onboarding@resend.dev"];

const PROHIBITED_RECIPIENT_ADDRESSES = [
  "notifications@fa-ibi.co.uk",
  "auth@fa-ibi.co.uk",
  "driver-alerts@fa-ibi.co.uk",
];

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
}

function formatFromAddress(rawAddress: string): string {
  const trimmed = rawAddress.trim();
  if (trimmed.includes("<") && trimmed.includes(">")) {
    return trimmed;
  }
  return `Virtual Car Hire <${trimmed}>`;
}

export function getDefaultFromAddress(type: string): string {
  const legacyFrom = getRuntimeEnv("EMAIL_FROM_ADDRESS") || process.env.EMAIL_FROM_ADDRESS;
  let address = "";

  if (type === "2fa" || type === "2fa_code") {
    address = getRuntimeEnv("AUTH_EMAIL_FROM") || process.env.AUTH_EMAIL_FROM || legacyFrom || "auth@fa-ibi.co.uk";
  } else if (
    type === "fleet_summary" ||
    type === "driver_licence_summary" ||
    type === "rent_due" ||
    type === "rent_due_tomorrow"
  ) {
    address = getRuntimeEnv("NOTIFICATIONS_EMAIL_FROM") || process.env.NOTIFICATIONS_EMAIL_FROM || legacyFrom || "notifications@fa-ibi.co.uk";
  } else {
    address = getRuntimeEnv("DRIVER_ALERTS_EMAIL_FROM") || process.env.DRIVER_ALERTS_EMAIL_FROM || legacyFrom || "driver-alerts@fa-ibi.co.uk";
  }

  const formatted = formatFromAddress(address);

  for (const domain of PROHIBITED_DOMAINS) {
    if (formatted.toLowerCase().includes(domain)) {
      throw new Error(`Sending address domain '${domain}' is strictly prohibited. Must use fa-ibi.co.uk domain.`);
    }
  }

  return formatted;
}

async function safeLogEmail(payload: {
  recipient: string;
  subject: string;
  type: string;
  status: "sent" | "failed" | "skipped";
  error_message?: string;
  metadata?: Record<string, any>;
}) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("email_log").insert({
      recipient: payload.recipient,
      subject: payload.subject,
      type: payload.type,
      status: payload.status,
      error_message: payload.error_message || null,
      metadata: payload.metadata || {},
    });
  } catch (err) {
    console.warn("[email-sender] Failed to insert email_log record:", err);
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
  await sendTelegramAlert(alertText);
}

export async function sendEmailDirect(options: SendEmailOptions): Promise<SendEmailResult> {
  const rawRecipient = options.recipient || options.to || "";
  const recipient = typeof rawRecipient === "string" ? rawRecipient.trim().toLowerCase() : "";
  const subject = options.subject || "Virtual Car Hire Notice";
  const emailType = options.emailType || options.template_type || "driver_alert";
  const metadata = options.metadata || {};

  // 1. Check for skipped send
  if (!recipient || recipient === "none" || options.skip) {
    const skipReason = options.skipReason || "Driver has no email address on file";
    await safeLogEmail({
      recipient: recipient || "none",
      subject,
      type: emailType,
      status: "skipped",
      error_message: skipReason,
      metadata,
    });
    return {
      success: true,
      status: "skipped",
      error: skipReason,
    };
  }

  // 2. Prohibited recipient guard
  if (PROHIBITED_RECIPIENT_ADDRESSES.includes(recipient)) {
    const errorMsg = `Sending email to internal sender address (${recipient}) is prohibited. Staff alerts must go to admin@fa-ibi.co.uk.`;
    await safeLogEmail({
      recipient,
      subject,
      type: emailType,
      status: "failed",
      error_message: errorMsg,
      metadata,
    });
    await triggerFailureTelegramAlert(emailType, recipient, errorMsg);
    return {
      success: false,
      status: "failed",
      error: errorMsg,
    };
  }

  // 3. From address resolution and domain check
  let senderAddress = "";
  try {
    const rawFrom = options.from || getDefaultFromAddress(emailType);
    senderAddress = formatFromAddress(rawFrom);
    for (const domain of PROHIBITED_DOMAINS) {
      if (senderAddress.toLowerCase().includes(domain)) {
        throw new Error(`Sending domain '${domain}' is strictly prohibited. Must use fa-ibi.co.uk.`);
      }
    }
  } catch (err: any) {
    const errorMsg = err.message || "Invalid sender address";
    await safeLogEmail({
      recipient,
      subject,
      type: emailType,
      status: "failed",
      error_message: errorMsg,
      metadata,
    });
    await triggerFailureTelegramAlert(emailType, recipient, errorMsg);
    return {
      success: false,
      status: "failed",
      error: errorMsg,
    };
  }

  // 4. Validate RESEND_API_KEY
  const resendApiKey = getRuntimeEnv("RESEND_API_KEY") || process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    const errorMsg = "RESEND_API_KEY environment variable is missing.";
    await safeLogEmail({
      recipient,
      subject,
      type: emailType,
      status: "failed",
      error_message: errorMsg,
      metadata: { ...metadata, sender: senderAddress },
    });
    await triggerFailureTelegramAlert(emailType, recipient, errorMsg);
    return {
      success: false,
      status: "failed",
      error: errorMsg,
    };
  }

  // 5. Construct Resend payload
  const isStaffAlert = emailType === "fleet_summary" || emailType === "driver_licence_summary";
  const emailHeaders = isStaffAlert
    ? {
        Importance: "high",
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
      }
    : undefined;

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

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      const errorDetail = resendData.message || resendData.error || JSON.stringify(resendData);
      const errorMsg = `Resend API error (${resendRes.status}): ${errorDetail}`;

      await safeLogEmail({
        recipient,
        subject,
        type: emailType,
        status: "failed",
        error_message: errorMsg,
        metadata: { ...metadata, sender: senderAddress },
      });

      await triggerFailureTelegramAlert(emailType, recipient, errorMsg);

      return {
        success: false,
        status: "failed",
        sender: senderAddress,
        error: errorMsg,
      };
    }

    await safeLogEmail({
      recipient,
      subject,
      type: emailType,
      status: "sent",
      metadata: { ...metadata, resend_id: resendData.id, sender: senderAddress },
    });

    return {
      success: true,
      status: "sent",
      id: resendData.id,
      sender: senderAddress,
    };
  } catch (err: any) {
    const errorMsg = err.message || "Network exception during email send";

    await safeLogEmail({
      recipient,
      subject,
      type: emailType,
      status: "failed",
      error_message: errorMsg,
      metadata: { ...metadata, sender: senderAddress },
    });

    await triggerFailureTelegramAlert(emailType, recipient, errorMsg);

    return {
      success: false,
      status: "failed",
      sender: senderAddress,
      error: errorMsg,
    };
  }
}
