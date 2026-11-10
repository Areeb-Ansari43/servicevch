/**
 * Tells the office when a driver submits an odometer reading in the portal:
 * a high-importance email to admin@fa-ibi.co.uk (from notifications@) and a Telegram post.
 * Never throws: a failed alert must not fail the driver's submission.
 */
export interface OdometerSubmissionInfo {
  driverName: string;
  reg: string;
  reading: number;
  previousReading: number | null;
  aiReading: number | null;
  aiConfidence: "high" | "low" | "none";
  photoUrl: string;
  submissionId?: string | null;
}

const fmt = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("en-GB")} miles`);
const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function aiLine(info: OdometerSubmissionInfo): string {
  if (info.aiReading == null) return "AI could not read the photo";
  const match = info.aiReading === info.reading ? " (matches)" : " (differs, please check)";
  return `${fmt(info.aiReading)} — ${info.aiConfidence} confidence${match}`;
}

export function buildOdometerTelegramText(info: OdometerSubmissionInfo, reviewUrl: string): string {
  const lines = [
    "📸 <b>New odometer reading submitted</b>",
    `Driver: ${esc(info.driverName)}`,
    `Reg: ${esc(info.reg || "—")}`,
    `Reading: <b>${fmt(info.reading)}</b>`,
    `Previous: ${fmt(info.previousReading)}`,
    `AI reading: ${esc(aiLine(info))}`,
  ];
  if (info.previousReading != null && info.reading >= info.previousReading) {
    lines.push(
      `Since last: +${(info.reading - info.previousReading).toLocaleString("en-GB")} miles`,
    );
  }
  if (info.photoUrl) lines.push(`<a href="${esc(info.photoUrl)}">View photo</a>`);
  lines.push(`<a href="${esc(reviewUrl)}">Review in CRM</a>`);
  return lines.join("\n");
}

export async function notifyOdometerSubmission(
  info: OdometerSubmissionInfo,
): Promise<{ email: string; telegram: string }> {
  const { CRM_BASE_URL } = await import("@/lib/domain-config");
  const reviewUrl = `${CRM_BASE_URL}/driver-mileage`;
  const out = { email: "not_sent", telegram: "not_sent" };

  const emailTask = (async () => {
    try {
      const { renderDriverAlertTemplate } = await import("@/lib/email-templates");
      const { sendEmailDirect } = await import("@/lib/email-sender.server");
      const { STAFF_ALERT_RECIPIENTS } = await import("@/lib/expiry-scan.server");
      const rows: [string, string][] = [
        ["Driver", info.driverName],
        ["Reg", info.reg || "—"],
        ["Reading entered", fmt(info.reading)],
        ["Previous reading", fmt(info.previousReading)],
        ["AI reading", aiLine(info)],
      ];
      const table = rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`,
        )
        .join("");
      const photo = info.photoUrl
        ? `<p style="margin:12px 0 0"><a href="${esc(info.photoUrl)}"><img src="${esc(info.photoUrl)}" alt="Odometer photo" style="max-width:100%;border-radius:8px;border:1px solid #e2e8f0" /></a></p>`
        : "";
      const html = renderDriverAlertTemplate({
        recipientName: "Operations Team",
        headerLabel: "ODOMETER SUBMITTED",
        headline: `${esc(info.driverName)} submitted an odometer reading`,
        subtext: `<table role="presentation" cellpadding="0" cellspacing="0" border="0">${table}</table>${photo}<p style="margin:12px 0 0">It is waiting for review in Driver Mileage.</p>`,
        actionUrl: reviewUrl,
        actionText: "Review in CRM",
      });
      const res = await sendEmailDirect({
        recipient: STAFF_ALERT_RECIPIENTS,
        subject: `Odometer submitted — ${info.driverName}${info.reg ? ` (${info.reg})` : ""}: ${fmt(info.reading)}`,
        html,
        text:
          rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
          `\n\nPhoto: ${info.photoUrl}\nReview: ${reviewUrl}`,
        emailType: "odometer_submission",
        metadata: { submission_id: info.submissionId ?? null },
      });
      out.email = res.status;
    } catch (err) {
      console.warn("[odometer-notify] email failed:", err);
      out.email = "failed";
    }
  })();

  const telegramTask = (async () => {
    try {
      const { sendTelegramAlert } = await import("@/lib/telegram.server");
      const res = await sendTelegramAlert(buildOdometerTelegramText(info, reviewUrl));
      out.telegram = res.sent ? "sent" : res.reason || "failed";
    } catch (err) {
      console.warn("[odometer-notify] telegram failed:", err);
      out.telegram = "failed";
    }
  })();

  await Promise.allSettled([emailTask, telegramTask]);
  return out;
}
