export interface EmailTemplate2FAData {
  code: string;
  userName?: string;
}

export interface EmailReminderCard {
  type: string;
  date: string;
  vehicleReg?: string;
  expiringInDays?: string | number;
  icon?: string;
}

export interface EmailTemplateReminderData {
  userName?: string;
  badgeLabel?: string;
  headline: string;
  subtext?: string;
  intro?: string;
  cards?: EmailReminderCard[];
  message?: string;
  warningCallout?: string;
  contactInfo?: string;
}

const REAL_LOGO_URL = "https://virtual-carhire.co.uk/assets/logo.png";

function getEmailFooter(): string {
  return `
    <!-- FOOTER -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;border-radius:0 0 16px 16px;padding:28px 24px;text-align:center;">
      <tr>
        <td align="center" style="padding-bottom:16px;">
          <img src="${REAL_LOGO_URL}" alt="Virtual Car Hire Logo" style="height:32px;max-width:200px;display:block;border:0;" />
        </td>
      </tr>
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="padding:0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94A3B8;font-weight:600;">
                <span style="color:#F97316;margin-right:4px;">🔒</span> Secure
              </td>
              <td style="padding:0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94A3B8;font-weight:600;border-left:1px solid #334155;">
                <span style="color:#F97316;margin-right:4px;">🛰️</span> Track
              </td>
              <td style="padding:0 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:12px;color:#94A3B8;font-weight:600;border-left:1px solid #334155;">
                <span style="color:#F97316;margin-right:4px;">⚡</span> Smarter Fleet Management
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:11px;color:#64748B;">
          &copy; ${new Date().getFullYear()} Virtual Car Hire Fleet Tracker. All rights reserved.
        </td>
      </tr>
    </table>
  `;
}

export function render2FAVerificationEmail(data: EmailTemplate2FAData): string {
  const greetingName = data.userName ? data.userName.trim() : "there";
  const formattedCode = data.code.trim();

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Verification Code - Virtual Car Hire</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#FFFFFF;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);overflow:hidden;border:1px solid #E2E8F0;">

            <!-- HEADER BANNER -->
            <tr>
              <td style="background-color:#0B132B;padding:32px 28px;text-align:left;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:16px;">
                      <img src="${REAL_LOGO_URL}" alt="Virtual Car Hire" style="height:38px;max-width:220px;display:block;border:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:8px;">
                      <span style="display:inline-block;background-color:rgba(249,115,22,0.18);border:1px solid #F97316;color:#F97316;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:4px;font-family:sans-serif;">
                        FLEET TRACKER
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:24px;font-weight:700;color:#FFFFFF;line-height:1.3;padding-bottom:8px;">
                      Here's your verification code.
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:14px;color:#94A3B8;line-height:1.5;">
                      Use the code below to complete your verification and get started with Virtual Car Hire Fleet Tracker.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- BODY SECTION -->
            <tr>
              <td style="padding:32px 28px;background-color:#FFFFFF;">
                <p style="margin:0 0 16px 0;font-size:15px;color:#334155;line-height:1.6;">
                  Hi ${greetingName},
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;color:#334155;line-height:1.6;">
                  To keep your account secure, please enter the following verification code in the Virtual Car Hire app or website.
                </p>

                <!-- CODE BOX -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                  <tr>
                    <td align="center" style="background-color:#FFF7ED;border:2px solid #F97316;border-radius:12px;padding:24px 16px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#C2410C;text-transform:uppercase;margin-bottom:10px;">
                        YOUR VERIFICATION CODE
                      </div>
                      <div style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#EA580C;">
                        ${formattedCode}
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- EXPIRATION LINE -->
                <p style="margin:0 0 20px 0;font-size:13px;color:#64748B;display:flex;align-items:center;">
                  <span style="font-size:16px;margin-right:6px;">⏰</span> This code expires in 10 minutes.
                </p>

                <!-- IGNORE NOTICE -->
                <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.5;border-top:1px solid #F1F5F9;padding-top:16px;">
                  If you didn't request this, you can safely ignore this email.
                </p>
              </td>
            </tr>

            ${getEmailFooter()}

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function getCardIcon(iconType?: string, alertType?: string): string {
  const t = (iconType || alertType || "").toLowerCase();
  if (t.includes("mot")) return "🔺";
  if (t.includes("pco")) return "🪪";
  if (t.includes("licence") || t.includes("license")) return "🆔";
  if (t.includes("rent") || t.includes("payment")) return "💷";
  if (t.includes("service")) return "🔧";
  return "🔔";
}

export function renderReminderAlertEmail(data: EmailTemplateReminderData): string {
  const greetingName = data.userName ? data.userName.trim() : "there";
  const badgeLabel = data.badgeLabel || "IMPORTANT REMINDER";
  const headline = data.headline;
  const subtext = data.subtext || "Please review the details below and take action if required.";
  const intro = data.intro || "Here is an important notification regarding your fleet account:";

  let cardsHTML = "";

  if (data.cards && data.cards.length > 0) {
    cardsHTML = data.cards
      .map((card) => {
        const iconSymbol = getCardIcon(card.icon, card.type);
        const daysBadge =
          card.expiringInDays !== undefined && card.expiringInDays !== null
            ? `<div style="background-color:#FEF3C7;border:1px solid #F59E0B;color:#B45309;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;white-space:nowrap;display:inline-block;">
                Expiring in ${card.expiringInDays} days
              </div>`
            : "";

        const regBadge = card.vehicleReg
          ? `<span style="display:inline-block;background-color:#F1F5F9;color:#334155;font-family:monospace;font-weight:700;font-size:12px;padding:2px 8px;border-radius:4px;margin-top:4px;">
              ${card.vehicleReg}
            </span>`
          : "";

        return `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-left:4px solid #F97316;border-radius:8px;margin-bottom:14px;box-shadow:0 2px 4px rgba(0,0,0,0.02);">
            <tr>
              <td style="padding:16px 20px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:top;width:36px;padding-right:12px;font-size:22px;line-height:1;">
                      ${iconSymbol}
                    </td>
                    <td style="vertical-align:top;">
                      <div style="font-size:16px;font-weight:700;color:#0F172A;line-height:1.3;">
                        ${card.type}
                      </div>
                      <div style="font-size:14px;color:#64748B;margin-top:2px;">
                        Due Date: <strong style="color:#1E293B;">${card.date}</strong>
                      </div>
                      ${regBadge ? `<div style="margin-top:6px;">${regBadge}</div>` : ""}
                    </td>
                    ${
                      daysBadge
                        ? `<td align="right" style="vertical-align:top;padding-left:12px;">${daysBadge}</td>`
                        : ""
                    }
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        `;
      })
      .join("");
  } else if (data.message) {
    cardsHTML = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E2E8F0;border-left:4px solid #F97316;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:20px;font-size:15px;color:#334155;line-height:1.6;">
            ${data.message.replace(/\n/g, "<br />")}
          </td>
        </tr>
      </table>
    `;
  }

  const defaultCallout =
    "Important Note: Please ensure all vehicle renewals and document updates are completed prior to the expiry date. Operating with expired documents may affect insurance coverage or vehicle access.";
  const warningNote = data.warningCallout || defaultCallout;
  const contactNote =
    data.contactInfo ||
    "If you have already renewed or need assistance, please reply directly to this email or contact the Virtual Car Hire fleet management team.";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${headline} - Virtual Car Hire</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F8FAFC;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#FFFFFF;border-radius:16px;box-shadow:0 10px 25px rgba(0,0,0,0.08);overflow:hidden;border:1px solid #E2E8F0;">

            <!-- HEADER BANNER -->
            <tr>
              <td style="background-color:#0B132B;padding:32px 28px;text-align:left;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding-bottom:16px;">
                      <img src="${REAL_LOGO_URL}" alt="Virtual Car Hire" style="height:38px;max-width:220px;display:block;border:0;" />
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:8px;">
                      <span style="display:inline-block;background-color:rgba(249,115,22,0.18);border:1px solid #F97316;color:#F97316;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:4px;font-family:sans-serif;">
                        ${badgeLabel}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:22px;font-weight:700;color:#FFFFFF;line-height:1.3;padding-bottom:8px;">
                      ${headline}
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:14px;color:#94A3B8;line-height:1.5;">
                      ${subtext}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- BODY SECTION -->
            <tr>
              <td style="padding:32px 28px;background-color:#FFFFFF;">
                <p style="margin:0 0 12px 0;font-size:15px;color:#334155;line-height:1.6;">
                  Hi ${greetingName},
                </p>
                <p style="margin:0 0 20px 0;font-size:15px;color:#334155;line-height:1.6;">
                  ${intro}
                </p>

                <!-- CARDS OR MESSAGE -->
                ${cardsHTML}

                <!-- DARK WARNING CALLOUT BOX -->
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#1E293B;border:1px solid #334155;border-left:4px solid #F97316;border-radius:10px;margin-top:24px;margin-bottom:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <div style="font-size:13px;font-weight:700;color:#F97316;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">
                        ⚠️ Action Required
                      </div>
                      <div style="font-size:13px;color:#F1F5F9;line-height:1.5;margin-bottom:10px;">
                        ${warningNote}
                      </div>
                      <div style="font-size:12px;color:#94A3B8;line-height:1.4;">
                        ${contactNote}
                      </div>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>

            ${getEmailFooter()}

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
