import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const VCH_HEADER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-header.png";
const VCH_FOOTER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-footer.png";

// Verified sender address mapping
const ALLOWED_SENDERS = {
  auth: "Virtual Car Hire <auth@fa-ibi.co.uk>",
  notifications: "Virtual Car Hire <notifications@fa-ibi.co.uk>",
  driverAlerts: "Virtual Car Hire <driver-alerts@fa-ibi.co.uk>",
};

// Forbidden sending address domains/patterns
const PROHIBITED_DOMAINS = ["resend.dev", "onboarding@resend.dev"];

// Internal company sender mailboxes that must NEVER be sent emails TO
const PROHIBITED_RECIPIENT_ADDRESSES = [
  "notifications@fa-ibi.co.uk",
  "auth@fa-ibi.co.uk",
  "driver-alerts@fa-ibi.co.uk",
];

function formatFromAddress(rawAddress: string): string {
  const trimmed = rawAddress.trim();
  if (trimmed.includes("<") && trimmed.includes(">")) {
    return trimmed;
  }
  return `Virtual Car Hire <${trimmed}>`;
}

function getFromAddress(type: string): string {
  const legacyFrom = Deno.env.get("EMAIL_FROM_ADDRESS");
  let address = "";

  if (type === "2fa" || type === "2fa_code") {
    address = Deno.env.get("AUTH_EMAIL_FROM") || legacyFrom || "auth@fa-ibi.co.uk";
  } else if (
    type === "fleet_summary" ||
    type === "driver_licence_summary" ||
    type === "rent_due" ||
    type === "rent_due_tomorrow"
  ) {
    address = Deno.env.get("NOTIFICATIONS_EMAIL_FROM") || legacyFrom || "notifications@fa-ibi.co.uk";
  } else {
    address = Deno.env.get("DRIVER_ALERTS_EMAIL_FROM") || legacyFrom || "driver-alerts@fa-ibi.co.uk";
  }

  const formatted = formatFromAddress(address);

  // Strictly enforce configured fa-ibi.co.uk sender domain and forbid resend.dev
  for (const domain of PROHIBITED_DOMAINS) {
    if (formatted.toLowerCase().includes(domain)) {
      throw new Error(`Sending address domain '${domain}' is strictly prohibited. Must use fa-ibi.co.uk sender domain.`);
    }
  }

  return formatted;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  const apiKeyHeader = req.headers.get("apikey");
  if (!authHeader && !apiKeyHeader) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized: Missing authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: any = {};
  try {
    payload = await req.json();
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const rawRecipient = payload.recipient || payload.to || "";
  const recipient = typeof rawRecipient === "string" ? rawRecipient.trim().toLowerCase() : "";
  const subject = payload.subject || "Virtual Car Hire Notice";
  const templateType = payload.template_type || payload.email_type || "driver_alert";
  const metadata = payload.metadata || {};

  // Handle skipped recipients (e.g. driver without email on file)
  if (!recipient || payload.skip) {
    const skipReason = payload.skip_reason || "Driver has no email address on file (signup pending)";

    if (supabaseUrl && supabaseServiceKey) {
      await supabase.from("email_log").insert({
        recipient: recipient || "none",
        subject,
        type: templateType,
        status: "skipped",
        error_message: skipReason,
        metadata,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: "skipped",
        message: skipReason,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // GUARD: Guard against sending emails TO internal company sender addresses (which bounce or suppress)
  if (PROHIBITED_RECIPIENT_ADDRESSES.includes(recipient)) {
    const blockedMsg = `Sending email to internal sender address (${recipient}) is prohibited. Staff alerts must go to admin@fa-ibi.co.uk.`;

    if (supabaseUrl && supabaseServiceKey) {
      await supabase.from("email_log").insert({
        recipient,
        subject,
        type: templateType,
        status: "failed",
        error_message: blockedMsg,
        metadata,
      });
    }

    return new Response(
      JSON.stringify({ success: false, status: "failed", error: blockedMsg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let emailFromAddress = "";
  try {
    const rawFrom = payload.from || getFromAddress(templateType);
    emailFromAddress = formatFromAddress(rawFrom);

    for (const domain of PROHIBITED_DOMAINS) {
      if (emailFromAddress.toLowerCase().includes(domain)) {
        throw new Error(`Sending domain '${domain}' is strictly prohibited. Must use fa-ibi.co.uk.`);
      }
    }
  } catch (err: any) {
    const errText = err.message || "Invalid sender address";
    if (supabaseUrl && supabaseServiceKey) {
      await supabase.from("email_log").insert({
        recipient,
        subject,
        type: templateType,
        status: "failed",
        error_message: errText,
        metadata,
      });
    }
    return new Response(
      JSON.stringify({ success: false, status: "failed", error: errText }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const html = payload.html || "";
  const plainText = payload.text || payload.plain_text;

  if (!html) {
    const missingHtmlMsg = "HTML payload missing. Pre-rendered HTML must be provided from src/lib/email-templates.ts.";
    if (supabaseUrl && supabaseServiceKey) {
      await supabase.from("email_log").insert({
        recipient,
        subject,
        type: templateType,
        status: "failed",
        error_message: missingHtmlMsg,
        metadata,
      });
    }
    return new Response(
      JSON.stringify({ success: false, status: "failed", error: missingHtmlMsg }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!resendApiKey) {
    const errorMsg = "RESEND_API_KEY environment variable is missing.";

    if (supabaseUrl && supabaseServiceKey) {
      await supabase.from("email_log").insert({
        recipient,
        subject,
        type: templateType,
        status: "failed",
        error_message: errorMsg,
        metadata,
      });
    }

    return new Response(
      JSON.stringify({ success: false, status: "failed", error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // High importance headers MUST ONLY be set on staff alert emails, NEVER on 2FA emails
  const isStaffAlert = templateType === "fleet_summary" || templateType === "driver_licence_summary";
  const emailHeaders = isStaffAlert
    ? {
        Importance: "high",
        "X-Priority": "1",
        "X-MSMail-Priority": "High",
      }
    : undefined;

  // Header and Footer Logo Attachments (CID Inline)
  const emailAttachments = [
    {
      filename: "logo-header.png",
      path: VCH_HEADER_LOGO_URL,
      content_id: "logo-header",
    },
    {
      filename: "logo-footer.png",
      path: VCH_FOOTER_LOGO_URL,
      content_id: "logo-footer",
    },
  ];

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: emailFromAddress,
        to: [recipient],
        subject,
        html,
        text: plainText,
        headers: emailHeaders,
        attachments: emailAttachments,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      const errorDetail = resendData.message || resendData.error || JSON.stringify(resendData);

      await supabase.from("email_log").insert({
        recipient,
        subject,
        type: templateType,
        status: "failed",
        error_message: `Resend API error (${resendRes.status}): ${errorDetail}`,
        metadata: { ...metadata, sender: emailFromAddress },
      });

      return new Response(
        JSON.stringify({
          success: false,
          status: "failed",
          error: resendData.message ? `Resend API: ${resendData.message}` : `Resend API returned status ${resendRes.status}`,
          details: resendData,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase.from("email_log").insert({
      recipient,
      subject,
      type: templateType,
      status: "sent",
      metadata: { ...metadata, resend_id: resendData.id, sender: emailFromAddress },
    });

    return new Response(
      JSON.stringify({
        success: true,
        status: "sent",
        id: resendData.id,
        sender: emailFromAddress,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    const errorMsg = err.message || "Network exception during send";

    await supabase.from("email_log").insert({
      recipient,
      subject,
      type: templateType,
      status: "failed",
      error_message: errorMsg,
      metadata: { ...metadata, sender: emailFromAddress },
    });

    return new Response(
      JSON.stringify({ success: false, status: "failed", error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
