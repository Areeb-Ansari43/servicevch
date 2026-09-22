import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const VCH_LOGO_URL = "https://virtual-carhire.co.uk/assets/logo.png";
const BRAND_HEADER_BG = "#0B132B";
const BRAND_DARK_BG = "#070C18";
const BRAND_CARD_BG = "#101828";
const BRAND_ORANGE = "#FF6A00";
const BRAND_ORANGE_LIGHT = "#FF8A2B";
const BRAND_TEXT_WHITE = "#FFFFFF";
const BRAND_TEXT_MUTED = "#94A3B8";

// --- Email Address Routing ---
function getFromAddress(type: string): string {
  const legacyFrom = Deno.env.get("EMAIL_FROM_ADDRESS");
  if (type === "2fa" || type === "2fa_code") {
    return Deno.env.get("AUTH_EMAIL_FROM") || legacyFrom || "auth@fa-ibi.co.uk";
  }
  if (
    type === "fleet_summary" ||
    type === "driver_licence_summary" ||
    type === "rent_due" ||
    type === "rent_due_tomorrow"
  ) {
    return Deno.env.get("NOTIFICATIONS_EMAIL_FROM") || legacyFrom || "notifications@fa-ibi.co.uk";
  }
  return Deno.env.get("DRIVER_ALERTS_EMAIL_FROM") || legacyFrom || "driver-alerts@fa-ibi.co.uk";
}

// --- Template Renderers ---

function renderHeader(label: string, headline: string, subtext?: string): string {
  return `
    <div style="background-color: ${BRAND_HEADER_BG}; padding: 32px 24px; text-align: center; border-top-left-radius: 12px; border-top-right-radius: 12px;">
      <div style="margin-bottom: 20px;">
        <img src="${VCH_LOGO_URL}" alt="Virtual Car Hire" style="max-width: 220px; height: auto; display: inline-block;" />
      </div>
      <div style="display: inline-block; background: rgba(255, 106, 0, 0.15); border: 1px solid rgba(255, 106, 0, 0.4); border-radius: 20px; padding: 4px 14px; margin-bottom: 12px;">
        <span style="color: ${BRAND_ORANGE_LIGHT}; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">${label}</span>
      </div>
      <h1 style="color: ${BRAND_TEXT_WHITE}; font-size: 22px; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3;">${headline}</h1>
      ${subtext ? `<p style="color: ${BRAND_TEXT_MUTED}; font-size: 14px; margin: 0; line-height: 1.5; max-width: 480px; display: inline-block;">${subtext}</p>` : ""}
    </div>
  `;
}

function renderFooter(badges?: string[], tagline?: string): string {
  const badgeList = badges || ["Secure", "Track", "Smarter Fleet Management"];
  return `
    <div style="background-color: ${BRAND_DARK_BG}; padding: 24px; text-align: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; border-top: 1px solid #1E293B;">
      <div style="margin-bottom: 16px;">
        <img src="${VCH_LOGO_URL}" alt="Virtual Car Hire" style="max-width: 140px; height: auto; opacity: 0.8; display: inline-block;" />
      </div>
      ${tagline ? `<p style="color: ${BRAND_TEXT_MUTED}; font-size: 12px; margin: 0 0 12px 0; font-style: italic;">${tagline}</p>` : ""}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 380px; margin: 0 auto;">
        <tr>
          ${badgeList
            .map(
              (b) => `
            <td align="center" style="color: ${BRAND_TEXT_MUTED}; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 0 4px;">
              <span style="color: ${BRAND_ORANGE}; margin-right: 4px;">✔</span> ${b}
            </td>
          `,
            )
            .join("")}
        </tr>
      </table>
      <p style="color: #64748B; font-size: 11px; margin: 16px 0 0 0;">
        © ${new Date().getFullYear()} Virtual Car Hire Ltd. All rights reserved.
      </p>
    </div>
  `;
}

function render2FATemplate(options: Record<string, any>): string {
  const code = options.code || "000000";
  const expiresIn = options.expiresInMinutes || 10;
  const name = options.recipientName || "there";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
          <tr>
            <td>
              ${renderHeader(
                "FLEET TRACKER",
                "Here's your verification code.",
                "Use the code below to complete your verification and get started with Virtual Car Hire Fleet Tracker.",
              )}
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px; color: ${BRAND_TEXT_WHITE};">
              <p style="font-size: 15px; margin: 0 0 16px 0; color: #E2E8F0;">Hi ${name},</p>
              <p style="font-size: 14px; margin: 0 0 24px 0; color: ${BRAND_TEXT_MUTED}; line-height: 1.5;">
                To keep your account secure, please enter the following verification code in the Virtual Car Hire app or website.
              </p>
              <div style="background-color: ${BRAND_HEADER_BG}; border: 2px solid ${BRAND_ORANGE}; border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px;">
                <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: ${BRAND_TEXT_MUTED}; margin-bottom: 8px;">
                  YOUR VERIFICATION CODE
                </div>
                <div style="font-family: 'Courier New', Courier, monospace, monospace; font-size: 38px; font-weight: 800; letter-spacing: 0.25em; color: ${BRAND_ORANGE_LIGHT};">
                  ${code}
                </div>
              </div>
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-size: 13px; color: ${BRAND_TEXT_MUTED};">
                  ⏱️ This code expires in <strong>${expiresIn} minutes</strong>.
                </span>
              </div>
              <p style="font-size: 12px; color: #64748B; margin: 0; line-height: 1.4; text-align: center;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td>
              ${renderFooter(["Secure", "Track", "Smarter Fleet Management"])}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderDriverAlertTemplate(options: Record<string, any>): string {
  const headerLabel = options.headerLabel || "IMPORTANT REMINDER";
  const headline = options.headline || "Vehicle Expiry Notice";
  const subtext = options.subtext || "Please review the details below and take appropriate action.";
  const name = options.recipientName || "there";
  const introLine = options.introLine || "Here is an important update regarding your vehicle or account:";

  const cardsHtml = (options.cards || [])
    .map((card: any) => {
      const daysText = card.daysRemaining !== undefined
        ? (card.daysRemaining <= 0 ? "Expired" : `Expiring in ${card.daysRemaining} days`)
        : null;
      const daysBg = card.daysRemaining !== undefined && card.daysRemaining <= 7 ? "#7F1D1D" : "rgba(255, 106, 0, 0.2)";
      const daysColor = card.daysRemaining !== undefined && card.daysRemaining <= 7 ? "#FCA5A5" : BRAND_ORANGE_LIGHT;

      let iconSymbol = "🚨";
      if (card.iconType === "mot") iconSymbol = "⚠️";
      if (card.iconType === "pco") iconSymbol = "🪪";
      if (card.iconType === "service") iconSymbol = "🔧";
      if (card.iconType === "rent") iconSymbol = "💳";

      return `
        <div style="background: ${BRAND_HEADER_BG}; border: 1px solid rgba(255, 106, 0, 0.3); border-radius: 10px; padding: 18px; margin-bottom: 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="vertical-align: middle;">
                <div style="font-size: 16px; font-weight: 700; color: ${BRAND_TEXT_WHITE}; margin-bottom: 4px;">
                  <span style="margin-right: 6px;">${iconSymbol}</span> ${card.title}
                </div>
                ${card.dateStr ? `<div style="font-size: 14px; font-weight: 600; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 4px;">Due / Expiry: ${card.dateStr}</div>` : ""}
                ${card.vehicleReg || card.vehicleModel ? `<div style="font-size: 13px; color: ${BRAND_TEXT_MUTED};">Vehicle: ${card.vehicleReg || ""} ${card.vehicleModel ? `(${card.vehicleModel})` : ""}</div>` : ""}
              </td>
              ${daysText ? `
                <td align="right" style="vertical-align: middle; padding-left: 12px;">
                  <span style="display: inline-block; background-color: ${daysBg}; color: ${daysColor}; font-size: 12px; font-weight: 700; padding: 6px 12px; border-radius: 16px; white-space: nowrap;">
                    ${daysText}
                  </span>
                </td>
              ` : ""}
            </tr>
          </table>
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
          <tr>
            <td>
              ${renderHeader(headerLabel, headline, subtext)}
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px; color: ${BRAND_TEXT_WHITE};">
              <p style="font-size: 15px; margin: 0 0 12px 0; color: #E2E8F0;">Hi ${name},</p>
              <p style="font-size: 14px; margin: 0 0 20px 0; color: ${BRAND_TEXT_MUTED}; line-height: 1.5;">${introLine}</p>
              ${options.cards && options.cards.length > 0 ? cardsHtml : ""}
              ${options.singleMessageBody ? `
                <div style="background-color: ${BRAND_HEADER_BG}; border: 1px solid #334155; border-radius: 10px; padding: 18px; margin-bottom: 20px; font-size: 14px; color: #E2E8F0; line-height: 1.6;">
                  ${options.singleMessageBody}
                </div>
              ` : ""}
              <div style="background-color: #0F172A; border-left: 4px solid ${BRAND_ORANGE}; border-radius: 6px; padding: 16px; margin-top: 20px; margin-bottom: 20px;">
                <div style="font-size: 13px; font-weight: 700; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 4px;">⚠️ Important Notice</div>
                <div style="font-size: 13px; color: #CBD5E1; line-height: 1.5;">
                  ${options.warningNote || "Driving an unroadworthy or unlicenced vehicle is against the law and your hire terms. Please contact our support team immediately if you need assistance."}
                </div>
              </div>
              ${options.actionUrl ? `
                <div style="text-align: center; margin-top: 24px;">
                  <a href="${options.actionUrl}" target="_blank" style="display: inline-block; background-color: ${BRAND_ORANGE}; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
                    ${options.actionText || "View Details in Portal"}
                  </a>
                </div>
              ` : ""}
            </td>
          </tr>
          <tr>
            <td>
              ${renderFooter(["Secure", "Track", "Smarter Fleet Management"])}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderFleetSummaryTemplate(options: Record<string, any>): string {
  const headerLabel = options.headerLabel || "IMPORTANT REMINDER";
  const headline = options.headline || "Multiple vehicles have upcoming MOT & PCO expiries";
  const subtext = options.subtext || "Ensure your fleet remains road-legal, compliant, and ready for work.";
  const vehicles = options.vehicles || [];
  const motCount = options.motCount ?? vehicles.filter((v: any) => v.motExpiry).length;
  const pcoCount = options.pcoCount ?? vehicles.filter((v: any) => v.pcoExpiry).length;

  const vehicleRows = vehicles
    .map((v: any) => {
      const motText = v.motDaysRemaining !== undefined ? `${v.motExpiry || "Soon"} (${v.motDaysRemaining} days)` : v.motExpiry || "N/A";
      const pcoText = v.pcoDaysRemaining !== undefined ? `${v.pcoExpiry || "Soon"} (${v.pcoDaysRemaining} days)` : v.pcoExpiry || "N/A";

      return `
        <tr style="border-bottom: 1px solid #1E293B;">
          <td style="padding: 12px 8px; vertical-align: middle;">
            ${v.photoUrl ? `<img src="${v.photoUrl}" alt="${v.registration}" style="width: 44px; height: 32px; object-fit: cover; border-radius: 4px;" />` : `<div style="width: 44px; height: 32px; background: #334155; border-radius: 4px; text-align: center; line-height: 32px; font-size: 12px; color: #94A3B8;">🚘</div>`}
          </td>
          <td style="padding: 12px 8px; vertical-align: middle;">
            <div style="font-size: 14px; font-weight: 700; color: ${BRAND_TEXT_WHITE};">${v.registration}</div>
            <div style="font-size: 12px; color: ${BRAND_TEXT_MUTED};">${v.model}</div>
          </td>
          <td style="padding: 12px 8px; vertical-align: middle; font-size: 12px;">
            ${v.motExpiry ? `<span style="background: rgba(245, 158, 11, 0.15); color: #FBBF24; padding: 2px 6px; border-radius: 4px; display: inline-block;">MOT: ${motText}</span>` : `<span style="color: #64748B;">MOT: OK</span>`}
            <div style="margin-top: 4px;">
              ${v.pcoExpiry ? `<span style="background: rgba(255, 106, 0, 0.15); color: ${BRAND_ORANGE_LIGHT}; padding: 2px 6px; border-radius: 4px; display: inline-block;">PCO: ${pcoText}</span>` : `<span style="color: #64748B;">PCO: OK</span>`}
            </div>
          </td>
          <td align="right" style="padding: 12px 8px; vertical-align: middle;">
            <a href="${v.detailsUrl || options.manageUrl || "#"}" style="font-size: 12px; color: ${BRAND_ORANGE_LIGHT}; text-decoration: none; font-weight: 600;">View Details →</a>
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 620px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
          <tr>
            <td>
              ${renderHeader(headerLabel, headline, subtext)}
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px; color: ${BRAND_TEXT_WHITE};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td>
                    <div style="font-size: 16px; font-weight: 700; color: ${BRAND_TEXT_WHITE};">Vehicles with Upcoming Expiries</div>
                    <div style="font-size: 13px; color: ${BRAND_TEXT_MUTED}; margin-top: 2px;">
                      We found <strong>${vehicles.length}</strong> vehicle${vehicles.length === 1 ? "" : "s"} with MOT or PCO licence expiring soon.
                    </div>
                  </td>
                  ${options.manageUrl ? `
                    <td align="right" style="vertical-align: top;">
                      <a href="${options.manageUrl}" target="_blank" style="font-size: 13px; color: ${BRAND_ORANGE_LIGHT}; text-decoration: none; font-weight: 600;">View All Vehicles →</a>
                    </td>
                  ` : ""}
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td width="48%" style="background-color: ${BRAND_HEADER_BG}; border: 1px solid #334155; border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 12px; color: ${BRAND_TEXT_MUTED}; text-transform: uppercase; font-weight: 600;">MOT Expiries</div>
                    <div style="font-size: 18px; font-weight: 800; color: #FBBF24; margin-top: 4px;">⚠️ ${motCount} vehicles</div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background-color: ${BRAND_HEADER_BG}; border: 1px solid #334155; border-radius: 8px; padding: 12px 14px;">
                    <div style="font-size: 12px; color: ${BRAND_TEXT_MUTED}; text-transform: uppercase; font-weight: 600;">PCO Expiries</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${BRAND_ORANGE_LIGHT}; margin-top: 4px;">🪪 ${pcoCount} vehicles</div>
                  </td>
                </tr>
              </table>
              <div style="margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: 700; color: ${BRAND_TEXT_MUTED}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
                  Due Soon (Sort by: Soonest expiry)
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                  ${vehicleRows}
                </table>
              </div>
              <div style="background-color: #0F172A; border-left: 4px solid ${BRAND_ORANGE}; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
                <div style="font-size: 13px; font-weight: 700; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 4px;">⚠️ Compliance Warning</div>
                <div style="font-size: 13px; color: #CBD5E1; line-height: 1.5; margin-bottom: 12px;">
                  Don't risk fines or vehicle downtime. Booking inspections early ensures continuous fleet utilization and compliance.
                </div>
                ${options.manageUrl ? `
                  <a href="${options.manageUrl}" target="_blank" style="display: inline-block; background-color: ${BRAND_ORANGE}; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 8px 18px; border-radius: 6px;">
                    Manage Expiries
                  </a>
                ` : ""}
              </div>
            </td>
          </tr>
          <tr>
            <td>
              ${renderFooter(["Secure", "Track", "Smarter Fleet Management"], "Keeping you on the road.")}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderDriverLicenceSummaryTemplate(options: Record<string, any>): string {
  const headerLabel = options.headerLabel || "IMPORTANT REMINDER";
  const headline = options.headline || "Your Driver Licence is expiring soon.";
  const subtext = options.subtext || "Review driver licence expiry dates across your team and take required action.";
  const introLine = options.introLine || "Hi there,\nHere are the upcoming driver licence expiry dates for your team:";
  const drivers = options.drivers || [];

  const driverRows = drivers
    .map((d: any) => {
      const initials = d.initials || (d.name ? d.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "DR");
      const daysText = d.daysRemaining <= 0 ? "Expired" : `in ${d.daysRemaining} days`;
      const daysBg = d.daysRemaining <= 14 ? "#7F1D1D" : "rgba(255, 106, 0, 0.2)";
      const daysColor = d.daysRemaining <= 14 ? "#FCA5A5" : BRAND_ORANGE_LIGHT;

      return `
        <tr style="border-bottom: 1px solid #1E293B;">
          <td style="padding: 12px 8px; vertical-align: middle;" width="40">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_ORANGE}, ${BRAND_HEADER_BG}); color: #FFF; font-size: 13px; font-weight: 700; text-align: center; line-height: 36px;">
              ${initials}
            </div>
          </td>
          <td style="padding: 12px 8px; vertical-align: middle;">
            <div style="font-size: 14px; font-weight: 700; color: ${BRAND_TEXT_WHITE};">${d.name}</div>
            <div style="font-size: 12px; color: ${BRAND_TEXT_MUTED};">ID: ${d.driverId} • ${d.licenceType || "Full Licence"}</div>
          </td>
          <td style="padding: 12px 8px; vertical-align: middle;">
            <div style="font-size: 13px; color: ${BRAND_TEXT_WHITE}; font-weight: 600;">${d.expiryDate}</div>
            <span style="display: inline-block; background-color: ${daysBg}; color: ${daysColor}; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; margin-top: 2px;">
              ${daysText}
            </span>
          </td>
          <td align="right" style="padding: 12px 8px; vertical-align: middle;">
            <a href="${d.reviewUrl || options.helpUrl || "#"}" style="font-size: 12px; background-color: #334155; color: ${BRAND_TEXT_WHITE}; text-decoration: none; font-weight: 600; padding: 6px 12px; border-radius: 6px; display: inline-block;">
              Review Licence
            </a>
          </td>
        </tr>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headline}</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
          <tr>
            <td>
              ${renderHeader(headerLabel, headline, subtext)}
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px; color: ${BRAND_TEXT_WHITE};">
              <p style="font-size: 14px; margin: 0 0 20px 0; color: ${BRAND_TEXT_MUTED}; line-height: 1.5;">
                ${introLine}
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 24px;">
                ${driverRows}
              </table>
              <div style="background-color: #0F172A; border-left: 4px solid ${BRAND_ORANGE}; border-radius: 6px; padding: 16px; margin-bottom: 20px;">
                <div style="font-size: 13px; font-weight: 700; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 4px;">⚠️ Regulatory Requirement</div>
                <div style="font-size: 13px; color: #CBD5E1; line-height: 1.5; margin-bottom: 12px;">
                  Don't risk fines or being off the road. Ensure all active drivers maintain a valid, unexpired UK driving licence.
                </div>
                ${options.helpUrl ? `
                  <a href="${options.helpUrl}" target="_blank" style="display: inline-block; background-color: ${BRAND_ORANGE}; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 8px 18px; border-radius: 6px;">
                    Get Help
                  </a>
                ` : ""}
              </div>
            </td>
          </tr>
          <tr>
            <td>
              ${renderFooter(["Secure & Compliant", "Track Your Drivers", "Smarter Fleet Management"])}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Handler ---

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
  const recipient = typeof rawRecipient === "string" ? rawRecipient.trim() : "";
  const subject = payload.subject || "Virtual Car Hire Notice";
  const templateType = payload.template_type || payload.email_type || "driver_alert";
  const templateData = payload.template_data || payload.data || {};
  const metadata = payload.metadata || {};

  // Recipient Rule: If driver has no email on file (or explicitly skipped), skip gracefully and log to email_log
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

  // Determine sender email address using 3-address routing rules
  const emailFromAddress = payload.from || getFromAddress(templateType);
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  // Render HTML based on template_type
  let html = payload.html || "";
  if (!html) {
    switch (templateType) {
      case "2fa":
      case "2fa_code":
        html = render2FATemplate(templateData);
        break;
      case "driver_alert":
      case "driver_notice":
      case "custom_message":
      case "rent_due":
      case "rent_due_tomorrow":
        html = renderDriverAlertTemplate({ ...templateData, headline: templateData.headline || subject });
        break;
      case "fleet_summary":
        html = renderFleetSummaryTemplate({ ...templateData, headline: templateData.headline || subject });
        break;
      case "driver_licence_summary":
        html = renderDriverLicenceSummaryTemplate({ ...templateData, headline: templateData.headline || subject });
        break;
      default:
        html = renderDriverAlertTemplate({ ...templateData, headline: subject });
        break;
    }
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

  // Attempt live send via Resend API
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

    // Success log
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
