/**
 * Shared Branded HTML Email Templates for Virtual Car Hire
 * Logo URL: https://virtual-carhire.co.uk/assets/logo.png
 */

export const VCH_LOGO_URL = "https://virtual-carhire.co.uk/assets/logo.png";

// Common Brand CSS Styles for Email Clients
const BRAND_HEADER_BG = "#0B132B";
const BRAND_DARK_BG = "#070C18";
const BRAND_CARD_BG = "#101828";
const BRAND_ORANGE = "#FF6A00";
const BRAND_ORANGE_LIGHT = "#FF8A2B";
const BRAND_TEXT_WHITE = "#FFFFFF";
const BRAND_TEXT_MUTED = "#94A3B8";

export interface Template2FAOptions {
  code: string;
  recipientName?: string;
  expiresInMinutes?: number;
}

export interface AlertCardItem {
  iconType?: "mot" | "pco" | "service" | "rent" | "general";
  title: string;
  dateStr?: string;
  vehicleReg?: string;
  vehicleModel?: string;
  photoUrl?: string;
  daysRemaining?: number;
}

export interface TemplateDriverAlertOptions {
  recipientName?: string;
  headerLabel?: string;
  headline: string;
  subtext?: string;
  introLine?: string;
  cards?: AlertCardItem[];
  singleMessageBody?: string;
  warningNote?: string;
  actionUrl?: string;
  actionText?: string;
}

export interface FleetVehicleExpiryItem {
  registration: string;
  model: string;
  photoUrl?: string;
  motExpiry?: string;
  motDaysRemaining?: number;
  pcoExpiry?: string;
  pcoDaysRemaining?: number;
  detailsUrl?: string;
}

export interface TemplateFleetSummaryOptions {
  headerLabel?: string;
  headline?: string;
  subtext?: string;
  motCount?: number;
  pcoCount?: number;
  vehicles?: FleetVehicleExpiryItem[];
  manageUrl?: string;
}

export interface DriverLicenceExpiryItem {
  driverId: string;
  name: string;
  initials?: string;
  licenceType?: string;
  expiryDate: string;
  daysRemaining: number;
  reviewUrl?: string;
}

export interface TemplateDriverLicenceSummaryOptions {
  headerLabel?: string;
  headline?: string;
  subtext?: string;
  introLine?: string;
  drivers?: DriverLicenceExpiryItem[];
  helpUrl?: string;
}

/**
 * Compact Header Generator with Corner Logo and Category Badge
 */
function renderHeader(label: string, headline: string, subtext?: string): string {
  return `
    <div style="background-color: ${BRAND_HEADER_BG}; padding: 16px 20px; border-top-left-radius: 12px; border-top-right-radius: 12px; border-bottom: 1px solid #1E293B;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="left" style="vertical-align: middle;">
            <img src="${VCH_LOGO_URL}" alt="Virtual Car Hire" style="max-height: 26px; width: auto; display: block;" />
          </td>
          <td align="right" style="vertical-align: middle;">
            <div style="display: inline-block; background: rgba(255, 106, 0, 0.15); border: 1px solid rgba(255, 106, 0, 0.35); border-radius: 14px; padding: 3px 10px;">
              <span style="color: ${BRAND_ORANGE_LIGHT}; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">${label}</span>
            </div>
          </td>
        </tr>
      </table>
      <h1 style="color: ${BRAND_TEXT_WHITE}; font-size: 18px; font-weight: 700; margin: 12px 0 2px 0; line-height: 1.25;">${headline}</h1>
      ${subtext ? `<p style="color: ${BRAND_TEXT_MUTED}; font-size: 13px; margin: 0; line-height: 1.4;">${subtext}</p>` : ""}
    </div>
  `;
}

/**
 * Compact Footer Generator
 */
function renderFooter(badges?: string[], tagline?: string): string {
  const badgeList = badges || ["Secure", "Track", "Smarter Fleet Management"];
  return `
    <div style="background-color: ${BRAND_DARK_BG}; padding: 14px 20px; text-align: center; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; border-top: 1px solid #1E293B;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 6px;">
        <tr>
          <td align="left" style="vertical-align: middle;">
            <img src="${VCH_LOGO_URL}" alt="Virtual Car Hire" style="max-height: 18px; width: auto; opacity: 0.75; display: inline-block;" />
          </td>
          <td align="right" style="vertical-align: middle; color: ${BRAND_TEXT_MUTED}; font-size: 11px;">
            ${badgeList.map((b) => `<span style="margin-left: 8px;"><span style="color: ${BRAND_ORANGE}; font-weight: bold;">✔</span> ${b}</span>`).join("")}
          </td>
        </tr>
      </table>
      ${tagline ? `<p style="color: ${BRAND_TEXT_MUTED}; font-size: 11px; margin: 0 0 4px 0; font-style: italic;">${tagline}</p>` : ""}
      <p style="color: #64748B; font-size: 10px; margin: 0;">
        © ${new Date().getFullYear()} Virtual Car Hire Ltd. All rights reserved.
      </p>
    </div>
  `;
}

/**
 * TEMPLATE 1: Verification Code (2FA)
 */
export function render2FATemplate(options: Template2FAOptions): string {
  const code = options.code;
  const expiresIn = options.expiresInMinutes || 10;
  const name = options.recipientName || "there";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 16px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
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
            <td style="padding: 18px 20px; color: ${BRAND_TEXT_WHITE};">
              <p style="font-size: 14px; margin: 0 0 10px 0; color: #E2E8F0;">Hi ${name},</p>
              <p style="font-size: 13px; margin: 0 0 16px 0; color: ${BRAND_TEXT_MUTED}; line-height: 1.4;">
                To keep your account secure, please enter the following verification code in the Virtual Car Hire app or website.
              </p>

              <!-- Verification Code Box -->
              <div style="background-color: ${BRAND_HEADER_BG}; border: 1.5px solid ${BRAND_ORANGE}; border-radius: 8px; padding: 14px; text-align: center; margin-bottom: 14px;">
                <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: ${BRAND_TEXT_MUTED}; margin-bottom: 4px;">
                  YOUR VERIFICATION CODE
                </div>
                <div style="font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.2em; color: ${BRAND_ORANGE_LIGHT};">
                  ${code}
                </div>
              </div>

              <!-- Expiry Line -->
              <div style="text-align: center; margin-bottom: 12px;">
                <span style="font-size: 12px; color: ${BRAND_TEXT_MUTED};">
                  ⏱️ This code expires in <strong>${expiresIn} minutes</strong>.
                </span>
              </div>

              <p style="font-size: 11px; color: #64748B; margin: 0; line-height: 1.3; text-align: center;">
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

/**
 * TEMPLATE 2: Reminder/Alert Notification (Single-Record / Driver-Facing)
 */
export function renderDriverAlertTemplate(options: TemplateDriverAlertOptions): string {
  const headerLabel = options.headerLabel || "IMPORTANT REMINDER";
  const headline = options.headline;
  const subtext = options.subtext || "Please review the details below and take appropriate action.";
  const name = options.recipientName || "there";
  const introLine = options.introLine || "Here is an important update regarding your vehicle or account:";

  const cardsHtml = (options.cards || [])
    .map((card) => {
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
        <div style="background: ${BRAND_HEADER_BG}; border: 1px solid rgba(255, 106, 0, 0.25); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${card.photoUrl ? `
                <td width="72" style="vertical-align: middle; padding-right: 12px;">
                  <img src="${card.photoUrl}" alt="${card.vehicleReg || "Vehicle"}" style="width: 72px; height: 52px; object-fit: contain; background-color: #070C18; border-radius: 6px; border: 1px solid #1E293B; display: block;" />
                </td>
              ` : ""}
              <td style="vertical-align: middle;">
                <div style="font-size: 14px; font-weight: 700; color: ${BRAND_TEXT_WHITE}; margin-bottom: 2px;">
                  <span style="margin-right: 4px;">${iconSymbol}</span> ${card.title}
                </div>
                ${card.dateStr ? `<div style="font-size: 13px; font-weight: 600; color: ${BRAND_ORANGE_LIGHT};">Due / Expiry: ${card.dateStr}</div>` : ""}
                ${card.vehicleReg || card.vehicleModel ? `<div style="font-size: 12px; color: ${BRAND_TEXT_MUTED};">Vehicle: ${card.vehicleReg || ""} ${card.vehicleModel ? `(${card.vehicleModel})` : ""}</div>` : ""}
              </td>
              ${daysText ? `
                <td align="right" style="vertical-align: middle; padding-left: 10px;">
                  <span style="display: inline-block; background-color: ${daysBg}; color: ${daysColor}; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; white-space: nowrap;">
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
<body style="margin: 0; padding: 16px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 540px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
          <tr>
            <td>
              ${renderHeader(headerLabel, headline, subtext)}
            </td>
          </tr>
          <tr>
            <td style="padding: 18px 20px; color: ${BRAND_TEXT_WHITE};">
              <p style="font-size: 14px; margin: 0 0 8px 0; color: #E2E8F0;">Hi ${name},</p>
              <p style="font-size: 13px; margin: 0 0 14px 0; color: ${BRAND_TEXT_MUTED}; line-height: 1.4;">${introLine}</p>

              ${options.cards && options.cards.length > 0 ? cardsHtml : ""}

              ${options.singleMessageBody ? `
                <div style="background-color: ${BRAND_HEADER_BG}; border: 1px solid #334155; border-radius: 8px; padding: 14px; margin-bottom: 14px; font-size: 13px; color: #E2E8F0; line-height: 1.5;">
                  ${options.singleMessageBody}
                </div>
              ` : ""}

              <!-- Dark Warning Callout Box -->
              <div style="background-color: #0F172A; border-left: 3px solid ${BRAND_ORANGE}; border-radius: 4px; padding: 10px 12px; margin-top: 12px; margin-bottom: 14px;">
                <div style="font-size: 12px; font-weight: 700; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 2px;">⚠️ Important Notice</div>
                <div style="font-size: 12px; color: #CBD5E1; line-height: 1.4;">
                  ${options.warningNote || "Driving an unroadworthy or unlicenced vehicle is against the law and your hire terms. Please contact our support team immediately if you need assistance."}
                </div>
              </div>

              ${options.actionUrl ? `
                <div style="text-align: center; margin-top: 16px;">
                  <a href="${options.actionUrl}" target="_blank" style="display: inline-block; background-color: ${BRAND_ORANGE}; color: #FFFFFF; font-size: 13px; font-weight: 700; text-decoration: none; padding: 10px 22px; border-radius: 6px;">
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

/**
 * TEMPLATE 3: Fleet-Wide Expiry Summary (Staff-Facing)
 */
export function renderFleetSummaryTemplate(options: TemplateFleetSummaryOptions): string {
  const headerLabel = options.headerLabel || "IMPORTANT REMINDER";
  const headline = options.headline || "Multiple vehicles have upcoming MOT & PCO expiries";
  const subtext = options.subtext || "Ensure your fleet remains road-legal, compliant, and ready for work.";
  const vehicles = options.vehicles || [];
  const motCount = options.motCount ?? vehicles.filter((v) => v.motExpiry).length;
  const pcoCount = options.pcoCount ?? vehicles.filter((v) => v.pcoExpiry).length;

  const vehicleRows = vehicles
    .map((v) => {
      const motText = v.motDaysRemaining !== undefined ? `${v.motExpiry || "Soon"} (${v.motDaysRemaining}d)` : v.motExpiry || "N/A";
      const pcoText = v.pcoDaysRemaining !== undefined ? `${v.pcoExpiry || "Soon"} (${v.pcoDaysRemaining}d)` : v.pcoExpiry || "N/A";

      return `
        <tr style="border-bottom: 1px solid #1E293B;">
          <td width="64" style="padding: 8px 6px; vertical-align: middle;">
            ${v.photoUrl ? `<img src="${v.photoUrl}" alt="${v.registration}" style="width: 60px; height: 42px; object-fit: contain; background-color: #070C18; border-radius: 4px; border: 1px solid #1E293B; display: block;" />` : `<div style="width: 60px; height: 42px; background: #172136; border-radius: 4px; text-align: center; line-height: 42px; font-size: 16px; color: #94A3B8;">🚘</div>`}
          </td>
          <td style="padding: 8px 6px; vertical-align: middle;">
            <div style="font-size: 13px; font-weight: 700; color: ${BRAND_TEXT_WHITE};">${v.registration}</div>
            <div style="font-size: 11px; color: ${BRAND_TEXT_MUTED};">${v.model}</div>
          </td>
          <td style="padding: 8px 6px; vertical-align: middle; font-size: 11px;">
            ${v.motExpiry ? `<span style="background: rgba(245, 158, 11, 0.15); color: #FBBF24; padding: 2px 6px; border-radius: 4px; display: inline-block; white-space: nowrap;">MOT: ${motText}</span>` : `<span style="color: #64748B;">MOT: OK</span>`}
            <div style="margin-top: 3px;">
              ${v.pcoExpiry ? `<span style="background: rgba(255, 106, 0, 0.15); color: ${BRAND_ORANGE_LIGHT}; padding: 2px 6px; border-radius: 4px; display: inline-block; white-space: nowrap;">PCO: ${pcoText}</span>` : `<span style="color: #64748B;">PCO: OK</span>`}
            </div>
          </td>
          <td align="right" style="padding: 8px 6px; vertical-align: middle;">
            <a href="${v.detailsUrl || options.manageUrl || "#"}" style="font-size: 11px; color: ${BRAND_ORANGE_LIGHT}; text-decoration: none; font-weight: 600; white-space: nowrap;">View Details →</a>
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
<body style="margin: 0; padding: 16px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: ${BRAND_CARD_BG}; border-radius: 12px; border: 1px solid #1E293B; overflow: hidden;">
          <tr>
            <td>
              ${renderHeader(headerLabel, headline, subtext)}
            </td>
          </tr>
          <tr>
            <td style="padding: 18px 20px; color: ${BRAND_TEXT_WHITE};">

              <!-- Section Header & Counts -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 12px;">
                <tr>
                  <td>
                    <div style="font-size: 14px; font-weight: 700; color: ${BRAND_TEXT_WHITE};">Vehicles with Upcoming Expiries</div>
                    <div style="font-size: 12px; color: ${BRAND_TEXT_MUTED}; margin-top: 1px;">
                      We found <strong>${vehicles.length}</strong> vehicle${vehicles.length === 1 ? "" : "s"} with MOT or PCO licence expiring soon.
                    </div>
                  </td>
                  ${options.manageUrl ? `
                    <td align="right" style="vertical-align: top;">
                      <a href="${options.manageUrl}" target="_blank" style="font-size: 12px; color: ${BRAND_ORANGE_LIGHT}; text-decoration: none; font-weight: 600;">View All →</a>
                    </td>
                  ` : ""}
                </tr>
              </table>

              <!-- Summary Pill Cards -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td width="48%" style="background-color: ${BRAND_HEADER_BG}; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px;">
                    <div style="font-size: 10px; color: ${BRAND_TEXT_MUTED}; text-transform: uppercase; font-weight: 600;">MOT Expiries</div>
                    <div style="font-size: 15px; font-weight: 800; color: #FBBF24; margin-top: 2px;">⚠️ ${motCount} vehicles</div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background-color: ${BRAND_HEADER_BG}; border: 1px solid #334155; border-radius: 6px; padding: 8px 12px;">
                    <div style="font-size: 10px; color: ${BRAND_TEXT_MUTED}; text-transform: uppercase; font-weight: 600;">PCO Expiries</div>
                    <div style="font-size: 15px; font-weight: 800; color: ${BRAND_ORANGE_LIGHT}; margin-top: 2px;">🪪 ${pcoCount} vehicles</div>
                  </td>
                </tr>
              </table>

              <!-- Detailed Vehicle List -->
              <div style="margin-bottom: 16px;">
                <div style="font-size: 11px; font-weight: 700; color: ${BRAND_TEXT_MUTED}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                  Due Soon (Sort by: Soonest expiry)
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
                  ${vehicleRows}
                </table>
              </div>

              <!-- Compliance Callout Box -->
              <div style="background-color: #0F172A; border-left: 3px solid ${BRAND_ORANGE}; border-radius: 4px; padding: 10px 12px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 2px;">⚠️ Compliance Warning</div>
                <div style="font-size: 12px; color: #CBD5E1; line-height: 1.4; margin-bottom: 8px;">
                  Don't risk fines or vehicle downtime. Booking inspections early ensures continuous fleet utilization and compliance.
                </div>
                ${options.manageUrl ? `
                  <a href="${options.manageUrl}" target="_blank" style="display: inline-block; background-color: ${BRAND_ORANGE}; color: #FFFFFF; font-size: 12px; font-weight: 700; text-decoration: none; padding: 6px 14px; border-radius: 4px;">
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

/**
 * TEMPLATE 4: Driver Licence Expiry Summary (Staff-Facing)
 */
export function renderDriverLicenceSummaryTemplate(options: TemplateDriverLicenceSummaryOptions): string {
  const headerLabel = options.headerLabel || "IMPORTANT REMINDER";
  const headline = options.headline || "Your Driver Licence is expiring soon.";
  const subtext = options.subtext || "Review driver licence expiry dates across your team and take required action.";
  const introLine = options.introLine || "Hi there,\nHere are the upcoming driver licence expiry dates for your team:";
  const drivers = options.drivers || [];

  const driverRows = drivers
    .map((d) => {
      const initials = d.initials || d.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
      const daysText = d.daysRemaining <= 0 ? "Expired" : `in ${d.daysRemaining} days`;
      const daysBg = d.daysRemaining <= 14 ? "#7F1D1D" : "rgba(255, 106, 0, 0.2)";
      const daysColor = d.daysRemaining <= 14 ? "#FCA5A5" : BRAND_ORANGE_LIGHT;

      return `
        <tr style="border-bottom: 1px solid #1E293B;">
          <td style="padding: 8px 6px; vertical-align: middle;" width="36">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, ${BRAND_ORANGE}, ${BRAND_HEADER_BG}); color: #FFF; font-size: 12px; font-weight: 700; text-align: center; line-height: 32px;">
              ${initials}
            </div>
          </td>
          <td style="padding: 8px 6px; vertical-align: middle;">
            <div style="font-size: 13px; font-weight: 700; color: ${BRAND_TEXT_WHITE};">${d.name}</div>
            <div style="font-size: 11px; color: ${BRAND_TEXT_MUTED};">ID: ${d.driverId} • ${d.licenceType || "Full Licence"}</div>
          </td>
          <td style="padding: 8px 6px; vertical-align: middle;">
            <div style="font-size: 12px; color: ${BRAND_TEXT_WHITE}; font-weight: 600;">${d.expiryDate}</div>
            <span style="display: inline-block; background-color: ${daysBg}; color: ${daysColor}; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 10px; margin-top: 1px;">
              ${daysText}
            </span>
          </td>
          <td align="right" style="padding: 8px 6px; vertical-align: middle;">
            <a href="${d.reviewUrl || options.helpUrl || "#"}" style="font-size: 11px; background-color: #334155; color: ${BRAND_TEXT_WHITE}; text-decoration: none; font-weight: 600; padding: 5px 10px; border-radius: 4px; display: inline-block;">
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
<body style="margin: 0; padding: 16px 0; background-color: #030712; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
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
            <td style="padding: 18px 20px; color: ${BRAND_TEXT_WHITE};">
              <p style="font-size: 13px; margin: 0 0 14px 0; color: ${BRAND_TEXT_MUTED}; line-height: 1.4; whitespace: pre-line;">
                ${introLine}
              </p>

              <!-- Driver List Table -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin-bottom: 16px;">
                ${driverRows}
              </table>

              <!-- Warning Callout Box -->
              <div style="background-color: #0F172A; border-left: 3px solid ${BRAND_ORANGE}; border-radius: 4px; padding: 10px 12px; margin-bottom: 16px;">
                <div style="font-size: 12px; font-weight: 700; color: ${BRAND_ORANGE_LIGHT}; margin-bottom: 2px;">⚠️ Regulatory Requirement</div>
                <div style="font-size: 12px; color: #CBD5E1; line-height: 1.4; margin-bottom: 8px;">
                  Don't risk fines or being off the road. Ensure all active drivers maintain a valid, unexpired UK driving licence.
                </div>
                ${options.helpUrl ? `
                  <a href="${options.helpUrl}" target="_blank" style="display: inline-block; background-color: ${BRAND_ORANGE}; color: #FFFFFF; font-size: 12px; font-weight: 700; text-decoration: none; padding: 6px 14px; border-radius: 4px;">
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
