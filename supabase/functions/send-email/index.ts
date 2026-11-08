import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// RETIRED as a public relay. The CRM now sends every email server-side through
// src/lib/email-sender.server.ts (sendEmailDirect). This function only accepts calls that
// present the project's service-role key, so it can no longer be used as an open relay.
const ALLOWED_SENDER_DOMAIN = "fa-ibi.co.uk";

const PROHIBITED_RECIPIENT_ADDRESSES = [
  "notifications@fa-ibi.co.uk",
  "auth@fa-ibi.co.uk",
  "driver-alerts@fa-ibi.co.uk",
];

function extractAddress(raw: string): string {
  const trimmed = (raw || "").trim();
  const m = trimmed.match(/<([^>]+)>/);
  return (m ? m[1] : trimmed).trim().toLowerCase();
}

function assertAllowedSender(raw: string): string {
  const address = extractAddress(raw);
  if (!address.endsWith(`@${ALLOWED_SENDER_DOMAIN}`)) {
    throw new Error(`Sender '${address}' is not allowed. All email must be sent from @${ALLOWED_SENDER_DOMAIN}.`);
  }
  return `Virtual Car Hire <${address}>`;
}

function envSender(name: string, fallback: string): string {
  const v = Deno.env.get(name);
  return v && extractAddress(v).endsWith(`@${ALLOWED_SENDER_DOMAIN}`) ? v : fallback;
}

function getFromAddress(type: string): string {
  if (type === "2fa" || type === "2fa_code") return assertAllowedSender(envSender("AUTH_EMAIL_FROM", "auth@fa-ibi.co.uk"));
  if (["fleet_summary", "driver_licence_summary", "rent_due", "rent_due_tomorrow"].includes(type)) {
    return assertAllowedSender(envSender("NOTIFICATIONS_EMAIL_FROM", "notifications@fa-ibi.co.uk"));
  }
  return assertAllowedSender(envSender("DRIVER_ALERTS_EMAIL_FROM", "driver-alerts@fa-ibi.co.uk"));
}

function isServiceRoleCaller(req: Request): boolean {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!serviceKey) return false;
  const auth = req.headers.get("Authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const apikey = (req.headers.get("apikey") || "").trim();
  return bearer === serviceKey || apikey === serviceKey;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!isServiceRoleCaller(req)) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "send-email edge function is retired for client use. Emails are sent by the CRM server.",
      }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

  // Handle skipped recipients
  if (!recipient || payload.skip) {
    const skipReason = payload.skip_reason || "Driver has no email address on file";

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

  // Guard against internal sender addresses as recipient
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
    emailFromAddress = payload.from ? assertAllowedSender(payload.from) : getFromAddress(templateType);
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
    const missingHtmlMsg = "HTML payload missing. Pre-rendered HTML must be provided.";
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

  const isStaffAlert = templateType === "fleet_summary" || templateType === "driver_licence_summary";
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
        from: emailFromAddress,
        to: [recipient],
        subject,
        html,
        text: plainText,
        headers: emailHeaders,
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
