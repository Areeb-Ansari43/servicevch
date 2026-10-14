/**
 * Shared Branded HTML Email Templates for Virtual Car Hire
 * Single source of truth for email template rendering across the application.
 */

export const VCH_HEADER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-header.png";
export const VCH_FOOTER_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo-footer.png";
// Legacy export fallback
export const VCH_LOGO_URL = VCH_HEADER_LOGO_URL;

export interface Template2FAOptions {
  code: string;
  recipientName?: string;
  expiresInMinutes?: number;
  logoHeaderSrc?: string;
  logoFooterSrc?: string;
}

export interface RentDueDriverItem {
  driverName: string;
  reg: string;
  vehicleModel?: string;
  weeklyRent: number;
  dueDate: string;
  rentStatus?: "paid" | "unpaid" | string;
}

export interface TemplateRentDueTomorrowOptions {
  recipientName?: string;
  headline?: string;
  subtext?: string;
  introLine?: string;
  drivers?: RentDueDriverItem[];
  cards?: any[];
  actionUrl?: string;
  actionText?: string;
  headerLabel?: string;
  logoHeaderSrc?: string;
  logoFooterSrc?: string;
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
  logoHeaderSrc?: string;
  logoFooterSrc?: string;
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
  logoHeaderSrc?: string;
  logoFooterSrc?: string;
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
  logoHeaderSrc?: string;
  logoFooterSrc?: string;
}

/**
 * Shared Unified Email Outer Wrapper Layout
 */
function renderUnifiedEmailLayout({
  title,
  eyebrow,
  headline,
  bodyText,
  cardContent,
  ctaUrl,
  ctaText,
  logoHeaderSrc = VCH_HEADER_LOGO_URL,
  logoFooterSrc = VCH_FOOTER_LOGO_URL,
}: {
  title: string;
  eyebrow?: string;
  headline: string;
  bodyText?: string;
  cardContent: string;
  ctaUrl?: string;
  ctaText?: string;
  logoHeaderSrc?: string;
  logoFooterSrc?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; width: 100%;">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.35); border: 1px solid #1e293b;">

          <!-- Centered Header Logo -->
          <tr>
            <td style="padding: 32px 24px 16px 24px; text-align: center; background-color: #0f172a;">
              <a href="https://virtual-carhire.co.uk" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${logoHeaderSrc}" alt="Virtual Car Hire" width="220" height="66" style="width: 220px; height: 66px; max-width: 220px; display: block; margin: 0 auto; border: 0; object-fit: contain;" />
              </a>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding: 12px 28px 32px 28px; background-color: #0f172a; color: #ffffff; text-align: center;">

              ${eyebrow ? `
                <div style="margin-bottom: 14px;">
                  <span style="display: inline-block; background-color: #f97316; color: #ffffff; font-size: 11px; font-weight: 800; padding: 5px 14px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.1em; box-shadow: 0 2px 6px rgba(249,115,22,0.3);">
                    ${eyebrow}
                  </span>
                </div>
              ` : ""}

              <!-- Centered Headline -->
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 12px 0; line-height: 1.35; text-align: center;">
                ${headline}
              </h1>

              <!-- Centered Subtext / Intro -->
              ${bodyText ? `<div style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5; text-align: center;">${bodyText}</div>` : ""}

              <!-- White Content Card with Dark Text -->
              <div style="background-color: #ffffff; border-radius: 12px; padding: 22px; color: #0f172a; margin-bottom: 24px; text-align: left; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                ${cardContent}
              </div>

              <!-- Orange CTA Button -->
              ${ctaUrl ? `
                <div style="text-align: center; margin-top: 24px; margin-bottom: 8px;">
                  <a href="${ctaUrl}" target="_blank" style="display: inline-block; background-color: #f97316; color: #ffffff; font-size: 14px; font-weight: 700; text-decoration: none; padding: 13px 32px; border-radius: 8px; text-align: center; box-shadow: 0 4px 12px rgba(249,115,22,0.35);">
                    ${ctaText || "View Details"}
                  </a>
                </div>
              ` : ""}
            </td>
          </tr>

          <!-- Dark Footer -->
          <tr>
            <td style="background-color: #070910; padding: 28px 24px; text-align: center; border-top: 1px solid #1e293b;">
              <a href="https://virtual-carhire.co.uk" target="_blank" style="text-decoration: none; display: inline-block; margin-bottom: 14px;">
                <img src="${logoFooterSrc}" alt="Virtual Car Hire" width="140" height="42" style="width: 140px; height: 42px; max-width: 140px; opacity: 0.9; display: block; margin: 0 auto; border: 0; object-fit: contain;" />
              </a>
              <p style="color: #64748b; font-size: 11px; line-height: 1.6; margin: 0; max-width: 520px; margin-left: auto; margin-right: auto;">
                Virtual Car Hire (FA-IBI LTD) | The Vista Centre, 50 Salisbury Rd, Cranford, Hounslow TW4 6JQ, Phone: <a href="tel:+442072946756" style="color: #94a3b8; text-decoration: none;">+44 20 7294 6756</a> | Email: <a href="mailto:info@fa-ibi.co.uk" style="color: #94a3b8; text-decoration: none;">info@fa-ibi.co.uk</a> | <a href="https://virtual-carhire.co.uk" style="color: #f97316; text-decoration: none; font-weight: 600;">Visit Website</a>
              </p>
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
 * TEMPLATE 1: 2FA Verification Code
 * Dedicated design per requirements: dark header, centred logo, headline "Your verification code",
 * ONE large code block (6 digits, letter-spaced monospace, high contrast),
 * "This code expires in 10 minutes", "If you didn't request this, ignore this email. Never share this code."
 * Nothing else (no label, no vehicle text, no button, no hero).
 */
export function render2FATemplate(options: Template2FAOptions): string {
  const code = options.code || "000000";
  const logoHeaderSrc = options.logoHeaderSrc || VCH_HEADER_LOGO_URL;
  const logoFooterSrc = options.logoFooterSrc || VCH_FOOTER_LOGO_URL;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Virtual Car Hire verification code: ${code}</title>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #0b0f19; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b0f19; width: 100%;">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.35); border: 1px solid #1e293b;">

          <!-- Header Centered Logo -->
          <tr>
            <td style="padding: 32px 24px 16px 24px; text-align: center; background-color: #0f172a;">
              <a href="https://virtual-carhire.co.uk" target="_blank" style="text-decoration: none; display: inline-block;">
                <img src="${logoHeaderSrc}" alt="Virtual Car Hire" width="220" height="66" style="width: 220px; height: 66px; max-width: 220px; display: block; margin: 0 auto; border: 0; object-fit: contain;" />
              </a>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding: 12px 28px 32px 28px; background-color: #0f172a; color: #ffffff; text-align: center;">

              <!-- Headline -->
              <h1 style="color: #ffffff; font-size: 22px; font-weight: 800; margin: 0 0 20px 0; line-height: 1.35; text-align: center;">
                Your verification code
              </h1>

              <!-- Large Code Block -->
              <div style="background-color: #ffffff; border-radius: 12px; padding: 24px; color: #0f172a; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 40px; font-weight: 900; letter-spacing: 0.35em; color: #f97316; padding-left: 0.35em; text-align: center;">
                  ${code}
                </div>
              </div>

              <!-- Expiry Line -->
              <div style="color: #94a3b8; font-size: 14px; font-weight: 600; margin-bottom: 12px; text-align: center;">
                This code expires in 10 minutes
              </div>

              <!-- Warning Line -->
              <div style="color: #64748b; font-size: 13px; line-height: 1.5; text-align: center;">
                If you didn't request this, ignore this email. Never share this code.
              </div>

            </td>
          </tr>

          <!-- Dark Footer -->
          <tr>
            <td style="background-color: #070910; padding: 28px 24px; text-align: center; border-top: 1px solid #1e293b;">
              <a href="https://virtual-carhire.co.uk" target="_blank" style="text-decoration: none; display: inline-block; margin-bottom: 14px;">
                <img src="${logoFooterSrc}" alt="Virtual Car Hire" width="140" height="42" style="width: 140px; height: 42px; max-width: 140px; opacity: 0.9; display: block; margin: 0 auto; border: 0; object-fit: contain;" />
              </a>
              <p style="color: #64748b; font-size: 11px; line-height: 1.6; margin: 0; max-width: 520px; margin-left: auto; margin-right: auto;">
                Virtual Car Hire (FA-IBI LTD) | The Vista Centre, 50 Salisbury Rd, Cranford, Hounslow TW4 6JQ, Phone: <a href="tel:+442072946756" style="color: #94a3b8; text-decoration: none;">+44 20 7294 6756</a> | Email: <a href="mailto:info@fa-ibi.co.uk" style="color: #94a3b8; text-decoration: none;">info@fa-ibi.co.uk</a> | <a href="https://virtual-carhire.co.uk" style="color: #f97316; text-decoration: none; font-weight: 600;">Visit Website</a>
              </p>
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
 * TEMPLATE 2: Rent Due Tomorrow (Driver & Staff Digest)
 */
export function renderRentDueTomorrowTemplate(options: TemplateRentDueTomorrowOptions): string {
  const name = options.recipientName || "Operations Team";
  const headline = options.headline || "Rent due tomorrow";
  const subtext = options.subtext || options.introLine || `The following active driver(s) have weekly rent due tomorrow:`;
  const headerLabel = options.headerLabel || "RENT REMINDER";

  let driversList: RentDueDriverItem[] = options.drivers || [];
  if (driversList.length === 0 && options.cards && options.cards.length > 0) {
    driversList = options.cards.map((c: any) => ({
      driverName: c.title ? c.title.split("—")[0].trim() : name,
      reg: c.vehicleReg || "N/A",
      vehicleModel: c.vehicleModel || "",
      weeklyRent: c.weeklyRent || 0,
      dueDate: c.dateStr || "Tomorrow",
      rentStatus: "unpaid",
    }));
  }

  const driverRows = driversList.map((d) => {
    const isPaid = (d.rentStatus || "").toLowerCase() === "paid";
    const statusBg = isPaid ? "#dcfce7" : "#ffedd5";
    const statusColor = isPaid ? "#15803d" : "#c2410c";
    const statusText = isPaid ? "PAID" : "UNPAID";

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 8px; vertical-align: middle;">
          <div style="font-size: 14px; font-weight: 700; color: #0f172a;">${d.driverName}</div>
        </td>
        <td style="padding: 12px 8px; vertical-align: middle;">
          <div style="font-size: 13px; font-weight: 600; color: #334155;">${d.reg}</div>
          ${d.vehicleModel ? `<div style="font-size: 11px; color: #64748b;">${d.vehicleModel}</div>` : ""}
        </td>
        <td align="right" style="padding: 12px 8px; vertical-align: middle; font-size: 14px; font-weight: 700; color: #0f172a;">
          £${Number(d.weeklyRent || 0).toFixed(2)}
        </td>
        <td align="center" style="padding: 12px 8px; vertical-align: middle; font-size: 13px; color: #475569; font-weight: 600;">
          ${d.dueDate || "Tomorrow"}
        </td>
        <td align="right" style="padding: 12px 8px; vertical-align: middle;">
          <span style="display: inline-block; background-color: ${statusBg}; color: ${statusColor}; font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 6px; letter-spacing: 0.05em;">
            ${statusText}
          </span>
        </td>
      </tr>
    `;
  }).join("");

  const cardContent = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #cbd5e1;">
          <th align="left" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Driver</th>
          <th align="left" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Vehicle</th>
          <th align="right" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Weekly</th>
          <th align="center" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Due Date</th>
          <th align="right" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${driverRows}
      </tbody>
    </table>
  `;

  return renderUnifiedEmailLayout({
    title: "Rent Due Tomorrow — Virtual Car Hire",
    eyebrow: headerLabel,
    headline,
    bodyText: subtext,
    cardContent,
    ctaUrl: options.actionUrl || "https://virtual-carhire.co.uk/portal/dashboard",
    ctaText: options.actionText || "View Details",
    logoHeaderSrc: options.logoHeaderSrc,
    logoFooterSrc: options.logoFooterSrc,
  });
}

/**
 * TEMPLATE 3: Driver Alert / Single Vehicle Notice
 */
export function renderDriverAlertTemplate(options: TemplateDriverAlertOptions): string {
  const headerLabel = options.headerLabel || "IMPORTANT NOTICE";
  const headline = options.headline;
  const subtext = options.subtext || options.introLine || "Please review the details below regarding your vehicle account:";
  const name = options.recipientName || "there";

  const cardsHtml = (options.cards || [])
    .map((card) => {
      const daysText = card.daysRemaining !== undefined
        ? (card.daysRemaining <= 0 ? "Expired" : `Expiring in ${card.daysRemaining} days`)
        : null;

      return `
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${card.photoUrl ? `
                <td width="72" style="vertical-align: middle; padding-right: 12px;">
                  <img src="${card.photoUrl}" alt="${card.vehicleReg || "Vehicle"}" style="width: 72px; height: 52px; object-fit: contain; background-color: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0; display: block;" />
                </td>
              ` : ""}
              <td style="vertical-align: middle;">
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">
                  ${card.title}
                </div>
                ${card.dateStr ? `<div style="font-size: 13px; font-weight: 600; color: #f97316;">Due / Expiry: ${card.dateStr}</div>` : ""}
                ${card.vehicleReg || card.vehicleModel ? `<div style="font-size: 12px; color: #64748b;">Vehicle: ${card.vehicleReg || ""} ${card.vehicleModel ? `(${card.vehicleModel})` : ""}</div>` : ""}
              </td>
              ${daysText ? `
                <td align="right" style="vertical-align: middle; padding-left: 10px;">
                  <span style="display: inline-block; background-color: #ffedd5; color: #c2410c; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; white-space: nowrap;">
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

  const cardContent = `
    <div style="font-size: 14px; color: #0f172a; line-height: 1.5;">
      <p style="margin: 0 0 12px 0; font-weight: 600;">Hi ${name},</p>
      ${options.cards && options.cards.length > 0 ? cardsHtml : ""}
      ${options.singleMessageBody ? `
        <div style="background-color: #f8fafc; border-left: 4px solid #f97316; border-radius: 4px; padding: 12px 14px; margin-bottom: 12px; font-size: 13px; color: #334155;">
          ${options.singleMessageBody}
        </div>
      ` : ""}
      <div style="background-color: #fef2f2; border-left: 3px solid #ef4444; border-radius: 4px; padding: 10px 12px; margin-top: 12px;">
        <div style="font-size: 12px; font-weight: 700; color: #991b1b; margin-bottom: 2px;">⚠️ Important Requirement</div>
        <div style="font-size: 12px; color: #7f1d1d; line-height: 1.4;">
          ${options.warningNote || "Driving an unroadworthy or unlicenced vehicle is against the law and your hire terms. Please contact our support team immediately if you need assistance."}
        </div>
      </div>
    </div>
  `;

  return renderUnifiedEmailLayout({
    title: `${headline} — Virtual Car Hire`,
    eyebrow: headerLabel,
    headline,
    bodyText: subtext,
    cardContent,
    ctaUrl: options.actionUrl || "https://virtual-carhire.co.uk/portal/dashboard",
    ctaText: options.actionText || "View Details in Portal",
    logoHeaderSrc: options.logoHeaderSrc,
    logoFooterSrc: options.logoFooterSrc,
  });
}

/**
 * TEMPLATE 4: Fleet Expiry Summary (Staff-Facing)
 */
export function renderFleetSummaryTemplate(options: TemplateFleetSummaryOptions): string {
  const headerLabel = options.headerLabel || "FLEET COMPLIANCE";
  const headline = options.headline || "Multiple vehicles have upcoming MOT & PCO expiries";
  const subtext = options.subtext || "Ensure your fleet remains road-legal, compliant, and ready for work.";
  const vehicles = options.vehicles || [];

  const vehicleRows = vehicles.map((v) => {
    const motText = v.motDaysRemaining !== undefined ? `${v.motExpiry || "Soon"} (${v.motDaysRemaining}d)` : v.motExpiry || "N/A";
    const pcoText = v.pcoDaysRemaining !== undefined ? `${v.pcoExpiry || "Soon"} (${v.pcoDaysRemaining}d)` : v.pcoExpiry || "N/A";

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td width="60" style="padding: 10px 6px; vertical-align: middle;">
          ${v.photoUrl ? `<img src="${v.photoUrl}" alt="${v.registration}" style="width: 56px; height: 40px; object-fit: contain; background-color: #f8fafc; border-radius: 4px; border: 1px solid #e2e8f0; display: block;" />` : `<div style="width: 56px; height: 40px; background: #f1f5f9; border-radius: 4px; text-align: center; line-height: 40px; font-size: 16px; color: #64748b;">🚘</div>`}
        </td>
        <td style="padding: 10px 6px; vertical-align: middle;">
          <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${v.registration}</div>
          <div style="font-size: 11px; color: #64748b;">${v.model}</div>
        </td>
        <td style="padding: 10px 6px; vertical-align: middle; font-size: 11px;">
          ${v.motExpiry ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block;">MOT: ${motText}</span>` : `<span style="color: #94a3b8;">MOT: OK</span>`}
          <div style="margin-top: 3px;">
            ${v.pcoExpiry ? `<span style="background: #ffedd5; color: #c2410c; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block;">PCO: ${pcoText}</span>` : `<span style="color: #94a3b8;">PCO: OK</span>`}
          </div>
        </td>
        <td align="right" style="padding: 10px 6px; vertical-align: middle;">
          <a href="${v.detailsUrl || options.manageUrl || "#"}" style="font-size: 11px; color: #f97316; text-decoration: none; font-weight: 700; white-space: nowrap;">View →</a>
        </td>
      </tr>
    `;
  }).join("");

  const cardContent = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #cbd5e1;">
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;" colspan="2">Vehicle</th>
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Expiries</th>
          <th align="right" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${vehicleRows}
      </tbody>
    </table>
  `;

  return renderUnifiedEmailLayout({
    title: "Fleet Compliance Expiry Digest — Virtual Car Hire",
    eyebrow: headerLabel,
    headline,
    bodyText: subtext,
    cardContent,
    ctaUrl: options.manageUrl || "https://hq.virtual-carhire.co.uk/vehicles",
    ctaText: "Manage Fleet Expiries",
    logoHeaderSrc: options.logoHeaderSrc,
    logoFooterSrc: options.logoFooterSrc,
  });
}

/**
 * TEMPLATE 5: Driver Licence Expiry Summary (Staff-Facing)
 */
export function renderDriverLicenceSummaryTemplate(options: TemplateDriverLicenceSummaryOptions): string {
  const headerLabel = options.headerLabel || "LICENCE COMPLIANCE";
  const headline = options.headline || "Driver Licences Expiring Soon";
  const subtext = options.subtext || options.introLine || "Review driver licence expiry dates across your team and take required action:";
  const drivers = options.drivers || [];

  const driverRows = drivers.map((d) => {
    const initials = d.initials || (d.name ? d.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() : "DR");
    const daysText = d.daysRemaining <= 0 ? "Expired" : `in ${d.daysRemaining}d`;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td width="36" style="padding: 10px 6px; vertical-align: middle;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #f97316; color: #ffffff; font-size: 12px; font-weight: 700; text-align: center; line-height: 32px;">
            ${initials}
          </div>
        </td>
        <td style="padding: 10px 6px; vertical-align: middle;">
          <div style="font-size: 13px; font-weight: 700; color: #0f172a;">${d.name}</div>
          <div style="font-size: 11px; color: #64748b;">ID: ${d.driverId} • ${d.licenceType || "Full Licence"}</div>
        </td>
        <td style="padding: 10px 6px; vertical-align: middle;">
          <div style="font-size: 12px; color: #0f172a; font-weight: 600;">${d.expiryDate}</div>
          <span style="display: inline-block; background-color: #ffedd5; color: #c2410c; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 8px; margin-top: 2px;">
            ${daysText}
          </span>
        </td>
        <td align="right" style="padding: 10px 6px; vertical-align: middle;">
          <a href="${d.reviewUrl || options.helpUrl || "#"}" style="font-size: 11px; background-color: #f1f5f9; color: #0f172a; text-decoration: none; font-weight: 700; padding: 5px 10px; border-radius: 4px; display: inline-block;">
            Review
          </a>
        </td>
      </tr>
    `;
  }).join("");

  const cardContent = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #cbd5e1;">
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;" colspan="2">Driver</th>
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Expiry Date</th>
          <th align="right" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${driverRows}
      </tbody>
    </table>
  `;

  return renderUnifiedEmailLayout({
    title: "Driver Licence Expiry Digest — Virtual Car Hire",
    eyebrow: headerLabel,
    headline,
    bodyText: subtext,
    cardContent,
    ctaUrl: options.helpUrl || "https://hq.virtual-carhire.co.uk/drivers",
    ctaText: "Review All Licences",
    logoHeaderSrc: options.logoHeaderSrc,
    logoFooterSrc: options.logoFooterSrc,
  });
}
