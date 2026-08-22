import { createFileRoute } from "@tanstack/react-router";

import { getNextMotDate, getPcoExpiryDate } from "@/lib/vehicle-date-fields";
import { getRuntimeEnv } from "@/integrations/supabase/config";

const ALERT_TO = "admin@fa-ibi.co.uk";
// Until fa-ibi.co.uk is verified in Resend, send from the shared verified sender.
const ALERT_FROM = "Virtual Car Hire <onboarding@resend.dev>";

export const Route = createFileRoute("/api/public/expiry-alerts")({
  server: {
    handlers: {
      POST: async () => runExpiryScan(),
      GET: async () => runExpiryScan(),
    },
  },
});

async function runExpiryScan() {
  const resendKey = getRuntimeEnv("RESEND_API_KEY");
  if (!resendKey) {
    return new Response(JSON.stringify({ ok: false, error: "Email not configured: RESEND_API_KEY missing" }), { status: 500 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: vehicles, error } = await supabaseAdmin
    .from("vehicles")
    .select("*");
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

  const now = Date.now();
  type Item = { reg: string; make: string; model: string; type: "MOT" | "PCO License"; date: string; days: number; expired: boolean };
  const items: Item[] = [];
  for (const v of vehicles ?? []) {
    const check = (type: Item["type"], date: string | null, reminderDays: number) => {
      if (!date) return;
      const t = new Date(date).getTime();
      if (isNaN(t)) return;
      const days = Math.ceil((t - now) / 86400000);
      // Reminder any time within N days of expiry, and warning on/after expiry day
      if (days <= reminderDays) {
        items.push({ reg: v.reg, make: v.make, model: v.model, type, date, days, expired: days <= 0 });
      }
    };
    check("MOT", getNextMotDate(v), 7);
    check("PCO License", getPcoExpiryDate(v), 10);
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: false, count: 0 }));
  }

  const expiredItems = items.filter((i) => i.expired);
  const reminderItems = items.filter((i) => !i.expired);

  items.sort((a, b) => a.days - b.days);

  const rows = items
    .map((i) => {
      const status = i.days <= 0
        ? (i.days === 0
            ? `<span style="color:#ff7a7a;font-weight:700">EXPIRES TODAY</span>`
            : `<span style="color:#ff7a7a;font-weight:700">EXPIRED — ${Math.abs(i.days)}d ago</span>`)
        : `<span style="color:#ffab3d;font-weight:700">${i.days}d left</span>`;
      return `<tr>
        <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,.07);font-family:ui-monospace,monospace;font-weight:700;color:#ffffff">${i.reg}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,.07);color:#d6d6de">${i.make} ${i.model}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,.07);color:#d6d6de">${i.type}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,.07);color:#d6d6de">${new Date(i.date).toLocaleDateString("en-GB")}</td>
        <td style="padding:12px;border-bottom:1px solid rgba(255,255,255,.07);text-align:right">${status}</td>
      </tr>`;
    })
    .join("");

  const heading = expiredItems.length > 0 && reminderItems.length === 0
    ? "Fleet expiry warnings"
    : expiredItems.length > 0
      ? "Fleet expiry alerts & warnings"
      : "Fleet expiry reminders";
  const summary = [
    reminderItems.length > 0 ? `${reminderItems.length} upcoming (MOT 7 days / PCO License 10 days before expiry)` : null,
    expiredItems.length > 0 ? `${expiredItems.length} expired` : null,
  ].filter(Boolean).join(" • ");

  const html = `
    <div style="background:#07070b;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <div style="max-width:720px;margin:0 auto;background:#101018;border:1px solid rgba(255,106,0,.22);border-radius:20px;padding:28px;color:#f4f4f6">
        <div style="font-weight:700;color:#ff6a00;font-size:12px;letter-spacing:.18em;text-transform:uppercase">Virtual Car Hire · Fleet Tracker</div>
        <h1 style="font-size:22px;margin:10px 0 4px;color:#ffffff">${heading}</h1>
        <p style="color:#9a9aa6;font-size:14px;margin:0 0 20px">${summary}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#14141d;border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden">
          <thead><tr style="background:rgba(255,106,0,.10)">
            <th style="padding:12px;text-align:left;color:#ff8a2b;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Reg</th>
            <th style="padding:12px;text-align:left;color:#ff8a2b;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Vehicle</th>
            <th style="padding:12px;text-align:left;color:#ff8a2b;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Type</th>
            <th style="padding:12px;text-align:left;color:#ff8a2b;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Expires</th>
            <th style="padding:12px;text-align:right;color:#ff8a2b;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Status</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#74747f;font-size:12px;margin-top:20px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">Automated daily notice from VCH Fleet Tracker.</p>
      </div>
    </div>`;

  const subject = expiredItems.length > 0 && reminderItems.length === 0
    ? `⚠️ Fleet expiry warning — ${expiredItems.length} expired`
    : expiredItems.length > 0
      ? `⚠️ Fleet expiry — ${expiredItems.length} expired, ${reminderItems.length} upcoming`
      : `Fleet expiry reminder — ${reminderItems.length} upcoming`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: ALERT_FROM,
      to: [ALERT_TO],
      subject,
      html,
    }),

  });


  if (!res.ok) {
    const txt = await res.text();
    return new Response(JSON.stringify({ ok: false, error: `Email send failed: ${res.status} ${txt}` }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, sent: true, count: items.length }));
}
