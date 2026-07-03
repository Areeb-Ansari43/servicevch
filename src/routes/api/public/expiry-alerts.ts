import { createFileRoute } from "@tanstack/react-router";

const ALERT_TO = "admin@fa-ibi.co.uk";
const ALERT_FROM = "Virtual Car Hire <admin@fa-ibi.co.uk>";

export const Route = createFileRoute("/api/public/expiry-alerts")({
  server: {
    handlers: {
      POST: async () => runExpiryScan(),
      GET: async () => runExpiryScan(),
    },
  },
});

async function runExpiryScan() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!lovableKey || !resendKey) {
    return new Response(JSON.stringify({ ok: false, error: "Email not configured" }), { status: 500 });
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: vehicles, error } = await supabaseAdmin
    .from("vehicles")
    .select("reg, make, model, next_mot_date, pco_expiry_date");
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

  const now = Date.now();
  type Item = { reg: string; make: string; model: string; type: "MOT" | "PCO License"; date: string; days: number };
  const items: Item[] = [];
  for (const v of vehicles ?? []) {
    const check = (type: Item["type"], date: string | null) => {
      if (!date) return;
      const t = new Date(date).getTime();
      if (isNaN(t)) return;
      const days = Math.ceil((t - now) / 86400000);
      if (days <= 30) items.push({ reg: v.reg, make: v.make, model: v.model, type, date, days });
    };
    check("MOT", v.next_mot_date);
    check("PCO License", v.pco_expiry_date);
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: false, count: 0 }));
  }

  items.sort((a, b) => a.days - b.days);

  const rows = items
    .map((i) => {
      const status =
        i.days < 0 ? `<span style="color:#ff6b6b;font-weight:700">${Math.abs(i.days)}d overdue</span>`
        : i.days === 0 ? `<span style="color:#ff6b6b;font-weight:700">Today</span>`
        : i.days <= 7 ? `<span style="color:#ff6b6b;font-weight:700">${i.days}d left</span>`
        : `<span style="color:#f5a524;font-weight:700">${i.days}d left</span>`;
      return `<tr>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-family:ui-monospace,monospace;font-weight:700">${i.reg}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">${i.make} ${i.model}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">${i.type}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb">${new Date(i.date).toLocaleDateString("en-GB")}</td>
        <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${status}</td>
      </tr>`;
    })
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px;background:#ffffff;color:#111">
      <div style="font-weight:700;color:#ff6a00;font-size:13px;letter-spacing:.18em;text-transform:uppercase">Virtual Car Hire</div>
      <h1 style="font-size:22px;margin:6px 0 4px">Fleet expiry alerts</h1>
      <p style="color:#475569;font-size:14px;margin:0 0 18px">${items.length} vehicle${items.length === 1 ? "" : "s"} with MOT or PCO License expiring within 30 days.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead style="background:#f8fafc"><tr>
          <th style="padding:10px;text-align:left">Reg</th>
          <th style="padding:10px;text-align:left">Vehicle</th>
          <th style="padding:10px;text-align:left">Type</th>
          <th style="padding:10px;text-align:left">Expires</th>
          <th style="padding:10px;text-align:right">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:18px">Automated daily reminder from VCH Fleet Tracker.</p>
    </div>`;

  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": resendKey,
    },
    body: JSON.stringify({
      from: ALERT_FROM,
      to: [ALERT_TO],
      subject: `Fleet expiry alerts — ${items.length} item${items.length === 1 ? "" : "s"} due`,
      html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    return new Response(JSON.stringify({ ok: false, error: `Email send failed: ${res.status} ${txt}` }), { status: 500 });
  }
  return new Response(JSON.stringify({ ok: true, sent: true, count: items.length }));
}
