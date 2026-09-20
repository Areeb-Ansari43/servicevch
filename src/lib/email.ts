import { supabase } from "@/integrations/supabase/client";
import {
  render2FAVerificationEmail,
  renderReminderAlertEmail,
  EmailTemplate2FAData,
  EmailTemplateReminderData,
} from "./email-templates";

export interface EmailSendPayload {
  to?: string;
  recipient?: string;
  type?: "2fa_verification" | "reminder" | "alert" | "verification" | string;
  subject?: string;
  data?: Record<string, any>;
  html?: string;
}

export interface SendEmailResult {
  success: boolean;
  status: "sent" | "failed" | "simulated" | "skipped";
  simulated?: boolean;
  id?: string | null;
  error?: string | null;
  message?: string;
}

/**
 * Sends an email via the 'send-email' Supabase Edge Function.
 * Returns result object indicating success or failure.
 */
export async function sendEmail(payload: EmailSendPayload): Promise<SendEmailResult> {
  const recipient = payload.recipient || payload.to;
  if (!recipient) {
    return {
      success: false,
      status: "failed",
      error: "Recipient email address is required.",
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke("send-email", {
      body: payload,
    });

    if (error) {
      return {
        success: false,
        status: "failed",
        error: error.message || "Failed to invoke send-email function",
      };
    }

    return {
      success: data?.success ?? true,
      status: data?.status || (data?.simulated ? "simulated" : "sent"),
      simulated: !!data?.simulated,
      id: data?.id || null,
      error: data?.error || null,
      message: data?.message,
    };
  } catch (err: any) {
    return {
      success: false,
      status: "failed",
      error: err?.message || String(err),
    };
  }
}

/**
 * Helper to send 2FA verification code email (Template 1)
 */
export async function send2FAVerificationEmail(
  recipient: string,
  code: string,
  userName?: string
): Promise<SendEmailResult> {
  return sendEmail({
    recipient,
    type: "2fa_verification",
    subject: `${code} is your verification code - Virtual Car Hire`,
    data: {
      code,
      userName,
    },
  });
}

/**
 * Helper to send Expiry/Reminder alert email (Template 2)
 */
export async function sendReminderAlertEmail(
  recipient: string,
  data: EmailTemplateReminderData
): Promise<SendEmailResult> {
  return sendEmail({
    recipient,
    type: "reminder",
    subject: data.headline || "Important Fleet Tracker Reminder",
    data: data,
  });
}

/**
 * Generate preview HTML for local display or testing
 */
export function generateEmailHTMLPreview(type: string, data: any): string {
  const t = type.toLowerCase();
  if (t === "2fa_verification" || t === "verification" || t === "2fa" || t === "otp") {
    return render2FAVerificationEmail(data as EmailTemplate2FAData);
  }
  return renderReminderAlertEmail(data as EmailTemplateReminderData);
}
