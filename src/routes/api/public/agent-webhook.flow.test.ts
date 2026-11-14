import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Whole WhatsApp conversations through the real webhook handler, with Supabase in memory and
 * WhatsApp / Telegram / Resend calls captured from fetch.
 */
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
let idSeq = 0;

function q(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let patch: Row = {};
  let inserted: Row[] = [];
  let orderCol: string | null = null;
  let asc = true;
  let lim = Infinity;
  const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === "update") {
      const hit = rows();
      hit.forEach((r) => Object.assign(r, JSON.parse(JSON.stringify(patch))));
      return { data: hit, error: null };
    }
    if (op === "insert" || op === "upsert") return { data: inserted, error: null };
    let out = [...rows()];
    if (orderCol)
      out.sort(
        (a, b) =>
          (String(a[orderCol!] ?? "") < String(b[orderCol!] ?? "") ? -1 : 1) * (asc ? 1 : -1),
      );
    return { data: out.slice(0, lim), error: null };
  };
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
    neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), b),
    is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), b),
    in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), b),
    gte: () => b,
    lte: () => b,
    gt: () => b,
    lt: () => b,
    or: () => b,
    ilike: () => b,
    not: () => b,
    order: (c: string, o?: { ascending?: boolean }) => (
      (orderCol = c),
      (asc = o?.ascending !== false),
      b
    ),
    limit: (n: number) => ((lim = n), b),
    insert: (row: Row | Row[]) => {
      op = "insert";
      const list = Array.isArray(row) ? row : [row];
      inserted = list.map((r) => ({
        id: `${table}_${++idSeq}`,
        created_at: new Date(Date.now() + idSeq).toISOString(),
        ...JSON.parse(JSON.stringify(r)),
      }));
      (tables[table] ??= []).push(...inserted);
      return b;
    },
    upsert: (row: Row) => b.insert(row),
    update: (p: Row) => ((op = "update"), (patch = p), b),
    delete: () => b,
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    single: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => q(t),
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path }, error: null }),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://cdn.test/${path}` },
        }),
      }),
    },
  },
}));

const { handleAgentWebhookRequest } = await import("./agent-webhook");

const sent: { to: string; kind: string; body: any }[] = [];
const originalFetch = globalThis.fetch;
const envKeys = [
  "META_ACCESS_TOKEN",
  "META_PHONE_NUMBER_ID",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "RESEND_API_KEY",
];

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  sent.length = 0;
  process.env.META_ACCESS_TOKEN = "test";
  process.env.META_PHONE_NUMBER_ID = "123";
  process.env.TELEGRAM_BOT_TOKEN = "test";
  process.env.TELEGRAM_CHAT_ID = "1";
  process.env.RESEND_API_KEY = "test";
  delete process.env.GEMINI_API_KEY;
  globalThis.fetch = mock(async (url: any, init: any) => {
    const u = String(url);
    let body: any = null;
    try {
      body = init?.body ? JSON.parse(init.body) : null;
    } catch {
      body = init?.body;
    }
    if (u.includes("graph.facebook.com") && !init?.body) {
      // Meta media lookup, then the download
      return new Response(
        JSON.stringify({
          url: `https://lookaside.test/${u.split("/").pop()}`,
          mime_type: "image/jpeg",
        }),
        { status: 200 },
      );
    }
    if (u.includes("lookaside.test"))
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    if (u.includes("graph.facebook.com")) {
      sent.push({ to: "whatsapp", kind: body?.type, body });
      return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), {
        status: 200,
      });
    }
    if (u.includes("api.telegram.org")) {
      sent.push({ to: "telegram", kind: "message", body });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (u.includes("api.resend.com")) {
      sent.push({ to: "email", kind: "email", body });
      return new Response(JSON.stringify({ id: "re_1" }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as any;
  tables.vehicles = [
    {
      user_id: "owner",
      reg: "TS19ABC",
      make: "TESLA",
      model: "MODEL 3",
      year: 2020,
      fuel_type: "Electric",
      status: "available",
    },
    {
      user_id: "owner",
      reg: "VT18VIT",
      make: "MERCEDES-BENZ",
      model: "VITO 114",
      year: 2018,
      fuel_type: "Diesel",
      status: "available",
    },
    {
      user_id: "owner",
      reg: "MG21EVA",
      make: "MG",
      model: "MG5 EV",
      year: 2021,
      fuel_type: "Electric",
      status: "available",
    },
  ];
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const k of envKeys) delete process.env[k];
});

let msgSeq = 0;
async function say(text: string, extra: Record<string, unknown> = {}) {
  const before = sent.length;
  const res = await handleAgentWebhookRequest(
    new Request("https://hq.test/api/public/agent-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: text,
        phone: "447700900123",
        chat_id: "447700900123",
        name: "Sam",
        meta_message_id: `in.${++msgSeq}`,
        ...extra,
      }),
    }),
  );
  await res.json();
  const out = sent.slice(before);
  const texts = out
    .filter((s) => s.to === "whatsapp")
    .map(
      (s) => s.body?.text?.body ?? s.body?.interactive?.body?.text ?? s.body?.image?.caption ?? "",
    )
    .filter(Boolean);
  return { texts, last: texts.at(-1) ?? "", out };
}
const lead = () => tables.whatsapp_leads?.[0] ?? {};

describe("car enquiry: short and remembers the car", () => {
  it("two cars -> pick one -> one Yes submits the Tesla to the team", async () => {
    await say("hi");
    await say("1");
    await say("Yes, Yes, 0");
    const both = await say("Mercedes Vito and Tesla Model 3");
    expect(both.last).toContain("Which one would you like");

    const pick = await say("Tesla model 3");
    // Details were already shown: a short confirmation, not the full spec again.
    expect(pick.last).toContain("Tesla Model 3");
    expect(pick.last).toContain("£260");
    expect(pick.last).not.toContain("Mileage:");
    expect(pick.last.split("\n").filter(Boolean).length).toBeLessThanOrEqual(4);
    expect(lead().car_enquiry_data.selectedVehicle.displayName).toBe("Tesla Model 3");

    const yes = await say("yes");
    expect(yes.last).toContain("Tesla Model 3");
    expect(yes.last).not.toContain("your selected vehicle request");
    expect(yes.last).not.toMatch(/is this everything/i);
    expect(lead().status).toBe("needs_human");
    const tg = sent
      .filter((s) => s.to === "telegram")
      .map((s) => s.body.text)
      .join("\n");
    expect(tg).toContain("Tesla Model 3");
  });

  it("one car named straight away shows full details once, then one Yes submits", async () => {
    await say("hi");
    await say("1");
    await say("yes yes 0");
    const pick = await say("vito");
    expect(pick.last).toContain("💷 Weekly rent: £370");
    const yes = await say("Yes");
    expect(yes.last).toContain("Mercedes Vito");
    expect(lead().status).toBe("needs_human");
  });

  it("No after the details offers the list again", async () => {
    await say("hi");
    await say("1");
    await say("yes yes 0");
    await say("vito");
    const no = await say("no");
    expect(no.last).toMatch(/another car/i);
  });
});

describe("emergency breakdown: thank the customer, alert the office", () => {
  it("car photo -> thanks + email and Telegram 'parked'; key photo -> thanks, case saved, alerts 'complete'", async () => {
    await say("hi");
    const menu = await say("2");
    expect(menu.texts.join("\n")).toContain("Emergency Breakdown");
    const sentBefore = sent.length;

    const photo = (id: string) => ({
      media_url: `https://graph.facebook.com/${id}`,
      media_meta_id: id,
      media_type: "image",
      media_mime_type: "image/jpeg",
    });
    const car = await say("(image)", photo("carmedia"));
    expect(car.last).toContain("Thank you, that's fine");
    expect(car.last).toMatch(/key being placed in the letter box/);
    const afterCar = sent.slice(sentBefore);
    const email1 = afterCar.find((s) => s.to === "email")!.body;
    expect(email1.to).toEqual(expect.arrayContaining(["admin@fa-ibi.co.uk"]));
    expect(email1.from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
    expect(email1.headers.Importance).toBe("high");
    expect(email1.subject).toContain("has parked at The Auto Surgeon");
    expect(email1.html).toContain("carmedia");
    const tg1 = afterCar.find((s) => s.to === "telegram")!.body.text;
    expect(tg1).toContain("car parked at the garage");
    expect(tg1).toContain("447700900123");
    expect(tg1).toContain("https://wa.me/447700900123");
    expect(tg1).toContain("carmedia");

    const mid = sent.length;
    const key = await say("(image)", photo("keymedia"));
    expect(key.last).toContain("thank you very much");
    expect(lead().status).toBe("closed");
    expect(tables.accident_cases?.[0]).toMatchObject({ case_type: "breakdown" });
    expect(tables.accident_cases[0].evidence_urls.join(" ")).toMatch(/carmedia.*keymedia/);
    const afterKey = sent.slice(mid);
    expect(afterKey.find((s) => s.to === "email")!.body.subject).toContain("posted the key");
    expect(afterKey.find((s) => s.to === "telegram")!.body.text).toContain("keymedia");
  });

  it("a text message before any photo asks for the car photo again", async () => {
    await say("hi");
    await say("2");
    const t = await say("ok i'm here");
    expect(t.last).toMatch(/photo of the vehicle parked in front of The Auto Surgeon/);
  });
});
