import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  render2FAVerificationEmail,
  renderReminderAlertEmail,
  EmailReminderCard,
} from "./templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SendEmailRequestBody {
  to?: string | string[];
  recipient?: string | string[];
  type?: string;
  template_type?: string;
  subject?: string;
  data?: Record<string, any>;
  params?: Record<string, any>;
  html?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: SendEmailRequestBody;
  try {
    body = await req.json();
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Invalid JSON request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawRecipient = body.recipient || body.to;
  const recipient = Array.isArray(rawRecipient)
    ? rawRecipient.join(", ")
    : typeof rawRecipient === "string"
    ? rawRecipient.trim()
    : "";

  if (!recipient) {
    return new Response(
      JSON.stringify({ error: "Missing required 'recipient' or 'to' email address" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const type = (body.type || body.template_type || "general").toLowerCase();
  const templateParams = body.data || body.params || {};

  let htmlContent = body.html || "";
  let defaultSubject = "Virtual Car Hire Fleet Tracker Notification";

  // Select HTML Template
  if (!htmlContent) {
    if (type === "2fa_verification" || type === "verification" || type === "2fa" || type === "otp") {
      defaultSubject = `${templateParams.code || ""} is your verification code - Virtual Car Hire`;
      htmlContent = render2FAVerificationEmail({
        code: String(templateParams.code || ""),
        userName: templateParams.userName || templateParams.name,
      });
    } else if (type === "reminder" || type === "alert" || type === "expiry") {
      defaultSubject = templateParams.headline || "Important Fleet Tracker Reminder";
      htmlContent = renderReminderAlertEmail({
        userName: templateParams.userName || templateParams.name,
        badgeLabel: templateParams.badgeLabel,
        headline: templateParams.headline || "Important Fleet Tracker Reminder",
        subtext: templateParams.subtext,
        intro: templateParams.intro,
        cards: templateParams.cards as EmailReminderCard[],
        message: templateParams.message,
        warningCallout: templateParams.warningCallout,
        contactInfo: templateParams.contactInfo,
      });
    } else {
      // General fallback template
      defaultSubject = templateParams.headline || body.subject || "Virtual Car Hire Notification";
      htmlContent = renderReminderAlertEmail({
        userName: templateParams.userName || templateParams.name,
        badgeLabel: templateParams.badgeLabel || "NOTIFICATION",
        headline: templateParams.headline || body.subject || "Virtual Car Hire Notice",
        message: templateParams.message || "You have a new notification in your fleet portal.",
      });
    }
  }

  const subject = body.subject || defaultSubject;

  // Read Environment Variables
  const fromAddress = Deno.env.get("EMAIL_FROM_ADDRESS")?.trim();
  const resendApiKey = Deno.env.get("RESEND_API_KEY")?.trim();

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    req.headers.get("Authorization")?.replace("Bearer ", "") ||
    "";

  const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

  let status: "sent" | "failed" | "simulated" | "skipped" = "sent";
  let errorMessage: string | null = null;
  let metadata: Record<string, any> = { type, template_type: type };

  // SAFETY GATE: If EMAIL_FROM_ADDRESS is not set, DO NOT attempt real send!
  if (!fromAddress) {
    status = "simulated";
    errorMessage = "EMAIL_FROM_ADDRESS env var is not set. Email send was simulated.";
    metadata.simulated_reason = "EMAIL_FROM_ADDRESS env var not configured";
    console.log(`[send-email Edge Function] SIMULATED send to ${recipient} (Subject: "${subject}")`);
  } else if (!resendApiKey) {
    status = "failed";
    errorMessage = "RESEND_API_KEY env var is not configured.";
    console.error(`[send-email Edge Function] FAILED send to ${recipient}: RESEND_API_KEY missing`);
  } else {
    // Attempt real send using Resend API
    try {
      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: Array.isArray(rawRecipient) ? rawRecipient : [recipient],
          subject: subject,
          html: htmlContent,
        }),
      });

      const resendData = await resendResp.json();
      if (!resendResp.ok) {
        status = "failed";
        errorMessage = resendData.message || JSON.stringify(resendData);
        metadata.resend_error = resendData;
        console.error(`[send-email Edge Function] Resend API error (${resendResp.status}):`, errorMessage);
      } else {
        status = "sent";
        metadata.resend_id = resendData.id;
        console.log(`[send-email Edge Function] Email successfully sent to ${recipient} (Resend ID: ${resendData.id})`);
      }
    } catch (err: any) {
      status = "failed";
      errorMessage = err?.message || String(err);
      metadata.catch_error = errorMessage;
      console.error(`[send-email Edge Function] Network / send exception:`, errorMessage);
    }
  }

  // Log send attempt (success, failure, or simulated) to email_log table
  if (supabase) {
    try {
      const { error: dbError } = await supabase.from("email_log").insert({
        recipient: recipient,
        subject: subject,
        type: type,
        template_type: type,
        status: status,
        error_message: errorMessage,
        metadata: metadata,
      });

      if (dbError) {
        console.error("[send-email Edge Function] DB logging error:", dbError.message);
      }
    } catch (dbErr: any) {
      console.error("[send-email Edge Function] DB logging exception:", dbErr?.message || dbErr);
    }
  }

  if (status === "failed") {
    return new Response(
      JSON.stringify({
        success: false,
        status: status,
        error: errorMessage,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      status: status,
      simulated: status === "simulated",
      id: metadata.resend_id || null,
      message: status === "simulated" ? errorMessage : "Email sent successfully",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
