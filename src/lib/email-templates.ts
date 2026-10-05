/**
 * Shared Branded HTML Email Templates for Virtual Car Hire
 * Logo URL: https://www.virtual-carhire.co.uk/assets/logo.png
 * Hero Image URL: https://virtual-carhire.co.uk/whatsapp/virtual-car-hire-welcome.jpg
 */

export const VCH_LOGO_URL = "https://hq.virtual-carhire.co.uk/email/logo.png";
export const HERO_IMAGE_URL = "https://hq.virtual-carhire.co.uk/email/hero.jpg";

export interface Template2FAOptions {
  code: string;
  recipientName?: string;
  expiresInMinutes?: number;
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
}: {
  title: string;
  eyebrow: string;
  headline: string;
  bodyText?: string;
  cardContent: string;
  ctaUrl?: string;
  ctaText?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #F4F5F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F4F5F7; width: 100%;">
    <tr>
      <td align="center" style="padding: 10px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%; background-color: #0B0E17; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.12);">

          <!-- Hero Image & Logo Header -->
          <tr>
            <td style="background-color: #0B0E17; padding: 0; text-align: center; position: relative;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color: #0B0E17; padding: 18px 24px; border-bottom: 1px solid #1E293B;" align="left">
                    <img src="cid:logo" alt="Virtual Car Hire" width="96" height="96" style="width: 96px; height: 96px; max-width: 96px; display: block; border: 0; object-fit: contain;" onerror="this.onerror=null;this.src='${VCH_LOGO_URL}';" />
                  </td>
                </tr>
                <tr>
                  <td style="padding: 0; background-color: #1E293B;">
                    <img src="cid:hero" alt="Virtual Car Hire Fleet" width="600" height="200" style="width: 100%; max-width: 600px; height: auto; max-height: 200px; object-fit: cover; display: block; border: 0; background-color: #1E293B;" onerror="this.onerror=null;this.src='${HERO_IMAGE_URL}';" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding: 28px 24px; background-color: #0B0E17; color: #FFFFFF;">
              <!-- Eyebrow Label -->
              <div style="color: #FF6A00; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px;">
                ${eyebrow}
              </div>

              <!-- Bold Headline -->
              <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 800; margin: 0 0 10px 0; line-height: 1.3;">
                ${headline}
              </h1>

              <!-- Short Body Text -->
              ${bodyText ? `<p style="color: #94A3B8; font-size: 14px; margin: 0 0 20px 0; line-height: 1.5;">${bodyText}</p>` : ""}

              <!-- White Card Section -->
              <div style="background-color: #FFFFFF; border-radius: 10px; padding: 20px; color: #14161B; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
                ${cardContent}
              </div>

              <!-- CTA Button -->
              ${ctaUrl ? `
                <div style="text-align: center; margin-top: 20px; margin-bottom: 8px;">
                  <a href="${ctaUrl}" target="_blank" style="display: inline-block; background-color: #FF6A00; color: #FFFFFF; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 28px; border-radius: 8px; text-align: center; box-shadow: 0 2px 6px rgba(255,106,0,0.3);">
                    ${ctaText || "View Details"}
                  </a>
                </div>
              ` : ""}
            </td>
          </tr>

          <!-- Dark Footer -->
          <tr>
            <td style="background-color: #070910; padding: 20px 24px; text-align: center; border-top: 1px solid #1E293B;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <img src="cid:logo" alt="Virtual Car Hire" width="72" height="72" style="width: 72px; height: 72px; max-width: 72px; opacity: 0.85; display: block; border: 0; object-fit: contain;" onerror="this.onerror=null;this.src='${VCH_LOGO_URL}';" />
                  </td>
                  <td align="right" style="vertical-align: middle; color: #94A3B8; font-size: 11px;">
                    <span style="color: #FF6A00; font-weight: bold;">✔</span> Smarter Fleet Management
                  </td>
                </tr>
              </table>
              <p style="color: #64748B; font-size: 11px; margin: 12px 0 0 0;">
                © ${new Date().getFullYear()} Virtual Car Hire Ltd. All rights reserved.
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
 */
export function render2FATemplate(options: Template2FAOptions): string {
  const code = options.code || "000000";
  const expiresIn = options.expiresInMinutes || 10;
  const name = options.recipientName || "there";

  const cardContent = `
    <div style="text-align: center; padding: 10px 0;">
      <div style="font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px;">
        Your Security Code
      </div>
      <div style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #FF6A00; background-color: #F8FAFC; border: 2px dashed #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 14px;">
        ${code}
      </div>
      <div style="font-size: 13px; color: #64748B;">
        ⏱️ Expires in <strong>${expiresIn} minutes</strong>
      </div>
    </div>
  `;

  return renderUnifiedEmailLayout({
    title: "Your Verification Code — Virtual Car Hire",
    eyebrow: "SECURITY VERIFICATION",
    headline: "Here's your login code",
    bodyText: `Hi ${name}, enter this 6-digit verification code to log in securely to Virtual Car Hire Fleet Tracker.`,
    cardContent,
  });
}

/**
 * TEMPLATE 2: Rent Due Tomorrow (Driver & Staff Digest)
 */
export function renderRentDueTomorrowTemplate(options: TemplateRentDueTomorrowOptions): string {
  const name = options.recipientName || "Operations Team";
  const headline = options.headline || "Rent due tomorrow";
  const subtext = options.subtext || options.introLine || "The following active drivers have weekly rent due tomorrow:";

  // Extract driver items from options.drivers or fallback from options.cards
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
    const statusBg = isPaid ? "#DEF7EC" : "#FFEDD5";
    const statusColor = isPaid ? "#03543F" : "#C2410C";
    const statusText = isPaid ? "PAID" : "UNPAID";

    return `
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td style="padding: 12px 8px; vertical-align: middle;">
          <div style="font-size: 14px; font-weight: 700; color: #14161B;">${d.driverName}</div>
        </td>
        <td style="padding: 12px 8px; vertical-align: middle;">
          <div style="font-size: 13px; font-weight: 600; color: #334155;">${d.reg}</div>
          ${d.vehicleModel ? `<div style="font-size: 11px; color: #64748B;">${d.vehicleModel}</div>` : ""}
        </td>
        <td align="right" style="padding: 12px 8px; vertical-align: middle; font-size: 14px; font-weight: 700; color: #14161B;">
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
        <tr style="border-bottom: 2px solid #CBD5E1;">
          <th align="left" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Driver</th>
          <th align="left" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Vehicle</th>
          <th align="right" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Weekly</th>
          <th align="center" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Due Date</th>
          <th align="right" style="padding: 8px 8px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${driverRows}
      </tbody>
    </table>
  `;

  return renderUnifiedEmailLayout({
    title: "Rent Due Tomorrow — Virtual Car Hire",
    eyebrow: "RENT REMINDER",
    headline,
    bodyText: subtext,
    cardContent,
    ctaUrl: options.actionUrl || "https://virtual-carhire.co.uk/portal/dashboard",
    ctaText: options.actionText || "View Drivers",
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
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${card.photoUrl ? `
                <td width="72" style="vertical-align: middle; padding-right: 12px;">
                  <img src="${card.photoUrl}" alt="${card.vehicleReg || "Vehicle"}" style="width: 72px; height: 52px; object-fit: contain; background-color: #FFFFFF; border-radius: 6px; border: 1px solid #E2E8F0; display: block;" />
                </td>
              ` : ""}
              <td style="vertical-align: middle;">
                <div style="font-size: 15px; font-weight: 700; color: #14161B; margin-bottom: 2px;">
                  ${card.title}
                </div>
                ${card.dateStr ? `<div style="font-size: 13px; font-weight: 600; color: #FF6A00;">Due / Expiry: ${card.dateStr}</div>` : ""}
                ${card.vehicleReg || card.vehicleModel ? `<div style="font-size: 12px; color: #64748B;">Vehicle: ${card.vehicleReg || ""} ${card.vehicleModel ? `(${card.vehicleModel})` : ""}</div>` : ""}
              </td>
              ${daysText ? `
                <td align="right" style="vertical-align: middle; padding-left: 10px;">
                  <span style="display: inline-block; background-color: #FFEDD5; color: #C2410C; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; white-space: nowrap;">
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
    <div style="font-size: 14px; color: #14161B; line-height: 1.5;">
      <p style="margin: 0 0 12px 0; font-weight: 600;">Hi ${name},</p>
      ${options.cards && options.cards.length > 0 ? cardsHtml : ""}
      ${options.singleMessageBody ? `
        <div style="background-color: #F8FAFC; border-left: 4px solid #FF6A00; border-radius: 4px; padding: 12px 14px; margin-bottom: 12px; font-size: 13px; color: #334155;">
          ${options.singleMessageBody}
        </div>
      ` : ""}
      <div style="background-color: #FEF2F2; border-left: 3px solid #EF4444; border-radius: 4px; padding: 10px 12px; margin-top: 12px;">
        <div style="font-size: 12px; font-weight: 700; color: #991B1B; margin-bottom: 2px;">⚠️ Important Requirement</div>
        <div style="font-size: 12px; color: #7F1D1D; line-height: 1.4;">
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
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td width="60" style="padding: 10px 6px; vertical-align: middle;">
          ${v.photoUrl ? `<img src="${v.photoUrl}" alt="${v.registration}" style="width: 56px; height: 40px; object-fit: contain; background-color: #F8FAFC; border-radius: 4px; border: 1px solid #E2E8F0; display: block;" />` : `<div style="width: 56px; height: 40px; background: #F1F5F9; border-radius: 4px; text-align: center; line-height: 40px; font-size: 16px; color: #64748B;">🚘</div>`}
        </td>
        <td style="padding: 10px 6px; vertical-align: middle;">
          <div style="font-size: 13px; font-weight: 700; color: #14161B;">${v.registration}</div>
          <div style="font-size: 11px; color: #64748B;">${v.model}</div>
        </td>
        <td style="padding: 10px 6px; vertical-align: middle; font-size: 11px;">
          ${v.motExpiry ? `<span style="background: #FEF3C7; color: #92400E; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block;">MOT: ${motText}</span>` : `<span style="color: #94A3B8;">MOT: OK</span>`}
          <div style="margin-top: 3px;">
            ${v.pcoExpiry ? `<span style="background: #FFEDD5; color: #C2410C; padding: 2px 6px; border-radius: 4px; font-weight: 600; display: inline-block;">PCO: ${pcoText}</span>` : `<span style="color: #94A3B8;">PCO: OK</span>`}
          </div>
        </td>
        <td align="right" style="padding: 10px 6px; vertical-align: middle;">
          <a href="${v.detailsUrl || options.manageUrl || "#"}" style="font-size: 11px; color: #FF6A00; text-decoration: none; font-weight: 700; white-space: nowrap;">View →</a>
        </td>
      </tr>
    `;
  }).join("");

  const cardContent = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #CBD5E1;">
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;" colspan="2">Vehicle</th>
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Expiries</th>
          <th align="right" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Action</th>
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
      <tr style="border-bottom: 1px solid #E2E8F0;">
        <td width="36" style="padding: 10px 6px; vertical-align: middle;">
          <div style="width: 32px; height: 32px; border-radius: 50%; background-color: #FF6A00; color: #FFFFFF; font-size: 12px; font-weight: 700; text-align: center; line-height: 32px;">
            ${initials}
          </div>
        </td>
        <td style="padding: 10px 6px; vertical-align: middle;">
          <div style="font-size: 13px; font-weight: 700; color: #14161B;">${d.name}</div>
          <div style="font-size: 11px; color: #64748B;">ID: ${d.driverId} • ${d.licenceType || "Full Licence"}</div>
        </td>
        <td style="padding: 10px 6px; vertical-align: middle;">
          <div style="font-size: 12px; color: #14161B; font-weight: 600;">${d.expiryDate}</div>
          <span style="display: inline-block; background-color: #FFEDD5; color: #C2410C; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 8px; margin-top: 2px;">
            ${daysText}
          </span>
        </td>
        <td align="right" style="padding: 10px 6px; vertical-align: middle;">
          <a href="${d.reviewUrl || options.helpUrl || "#"}" style="font-size: 11px; background-color: #F1F5F9; color: #14161B; text-decoration: none; font-weight: 700; padding: 5px 10px; border-radius: 4px; display: inline-block;">
            Review
          </a>
        </td>
      </tr>
    `;
  }).join("");

  const cardContent = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse;">
      <thead>
        <tr style="border-bottom: 2px solid #CBD5E1;">
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;" colspan="2">Driver</th>
          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Expiry Date</th>
          <th align="right" style="padding: 8px 6px; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Action</th>
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
  });
}
