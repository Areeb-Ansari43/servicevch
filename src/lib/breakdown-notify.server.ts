/**
 * Emergency breakdown alerts for the office: a high-importance email to admin@fa-ibi.co.uk
 * (from notifications@) and a Telegram post, with the customer's number and the photos.
 * Never throws: a failed alert must not break the customer's WhatsApp flow.
 */
export interface BreakdownAlertInfo {
  stage: "parked" | "complete";
  customerName: string;
  phone: string | null;
  vehiclePhotoUrl?: string | null;
  keyEvidenceUrl?: string | null;
  keyIsVideo?: boolean;
  aiCheck?: string | null;
  leadId: string;
}

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function waLink(phone: string | null): string | null {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export function breakdownHeadline(info: BreakdownAlertInfo): string {
  return info.stage === "parked"
    ? `${info.customerName} has parked their car at The Auto Surgeon. Please check.`
    : `${info.customerName} has posted the key in the letter box. Breakdown case complete.`;
}

export function buildBreakdownTelegramText(info: BreakdownAlertInfo, crmUrl: string): string {
  const wa = waLink(info.phone);
  const lines = [
    info.stage === "parked"
      ? "🛠️ <b>Breakdown: car parked at the garage</b>"
      : "🔑 <b>Breakdown: key posted, case complete</b>",
    esc(breakdownHeadline(info)),
    `<b>Customer:</b> ${esc(info.customerName)}`,
    info.phone
      ? `<b>Phone:</b> ${esc(info.phone)}${wa ? ` (<a href="${wa}">WhatsApp</a>)` : ""}`
      : "",
    info.vehiclePhotoUrl ? `<a href="${esc(info.vehiclePhotoUrl)}">📷 Car photo</a>` : "",
    info.keyEvidenceUrl
      ? `<a href="${esc(info.keyEvidenceUrl)}">🔑 Key ${info.keyIsVideo ? "video" : "photo"}</a>`
      : "",
    info.aiCheck ? `<i>AI photo check: ${esc(info.aiCheck)}</i>` : "",
    `<a href="${esc(crmUrl)}">Open in CRM</a>`,
  ];
  return lines.filter(Boolean).join("\n");
}

export async function notifyBreakdown(
  info: BreakdownAlertInfo,
): Promise<{ email: string; telegram: string }> {
  const out = { email: "not_sent", telegram: "not_sent" };
  const { CRM_BASE_URL } = await import("@/lib/domain-config");
  const crmUrl = `${CRM_BASE_URL}/whatsapp-leads?lead=${encodeURIComponent(info.leadId)}`;
  const wa = waLink(info.phone);

  const email = (async () => {
    try {
      const { renderDriverAlertTemplate } = await import("@/lib/email-templates");
      const { sendEmailDirect } = await import("@/lib/email-sender.server");
      const { STAFF_ALERT_RECIPIENTS } = await import("@/lib/expiry-scan.server");
      const img = (url: string | null | undefined, alt: string) =>
        url
          ? `<p style="margin:10px 0 0"><a href="${esc(url)}"><img src="${esc(url)}" alt="${alt}" style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0" /></a></p>`
          : "";
      const rows = [
        ["Customer", info.customerName],
        ["Phone", info.phone || "Not provided"],
        [
          "Garage",
          "The Auto Surgeon, Unit 3, Squirrels Trading Estate, Viveash Close, Hayes, UB3 4RZ",
        ],
        ...(info.aiCheck ? [["AI photo check", info.aiCheck]] : []),
      ]
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`,
        )
        .join("");
      const html = renderDriverAlertTemplate({
        recipientName: "Operations Team",
        headerLabel: info.stage === "parked" ? "BREAKDOWN: CAR AT GARAGE" : "BREAKDOWN: KEY POSTED",
        headline: esc(breakdownHeadline(info)),
        subtext:
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows}</table>` +
          (wa
            ? `<p style="margin:12px 0 0"><a href="${wa}">Message the customer on WhatsApp</a></p>`
            : "") +
          img(info.vehiclePhotoUrl, "Car at the garage") +
          (info.keyEvidenceUrl && !info.keyIsVideo
            ? img(info.keyEvidenceUrl, "Key in the letter box")
            : "") +
          (info.keyEvidenceUrl && info.keyIsVideo
            ? `<p style="margin:10px 0 0"><a href="${esc(info.keyEvidenceUrl)}">Watch the key video</a></p>`
            : ""),
        actionUrl: crmUrl,
        actionText: "Open in CRM",
      });
      const res = await sendEmailDirect({
        recipient: STAFF_ALERT_RECIPIENTS,
        subject:
          info.stage === "parked"
            ? `Breakdown: ${info.customerName} has parked at The Auto Surgeon - please check`
            : `Breakdown: ${info.customerName} has posted the key - case complete`,
        html,
        text: `${breakdownHeadline(info)}\nPhone: ${info.phone || "-"}\nCar photo: ${info.vehiclePhotoUrl || "-"}\nKey: ${info.keyEvidenceUrl || "-"}\nCRM: ${crmUrl}`,
        emailType: "breakdown_alert",
        metadata: { lead_id: info.leadId, stage: info.stage },
      });
      out.email = res.status;
    } catch (err) {
      console.warn("[breakdown-notify] email failed:", err);
      out.email = "failed";
    }
  })();

  const telegram = (async () => {
    try {
      const { sendTelegramAlert } = await import("@/lib/telegram.server");
      const res = await sendTelegramAlert(buildBreakdownTelegramText(info, crmUrl));
      out.telegram = res.sent ? "sent" : res.reason || "failed";
    } catch (err) {
      console.warn("[breakdown-notify] telegram failed:", err);
      out.telegram = "failed";
    }
  })();

  await Promise.allSettled([email, telegram]);
  return out;
}
