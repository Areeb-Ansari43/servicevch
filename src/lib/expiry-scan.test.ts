import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// ---- Minimal fake of the supabase-js query builder used by runExpiryScan ------------------
type Row = Record<string, any>;
const db: {
  tables: Record<string, Row[]>;
  inserts: { table: string; row: Row }[];
  updates: { table: string; patch: Row }[];
} = {
  tables: {},
  inserts: [],
  updates: [],
};

function builder(table: string) {
  let rows = [...(db.tables[table] ?? [])];
  let pendingInsert: Row | null = null;
  const b: any = {
    select: () => b,
    eq: (col: string, val: any) => ((rows = rows.filter((r) => r[col] === val)), b),
    neq: (col: string, val: any) => ((rows = rows.filter((r) => r[col] !== val)), b),
    is: (col: string, val: any) => ((rows = rows.filter((r) => (r[col] ?? null) === val)), b),
    gte: (col: string, val: any) => ((rows = rows.filter((r) => String(r[col]) >= String(val))), b),
    order: () => b,
    limit: (n: number) => ((rows = rows.slice(0, n)), b),
    insert: (row: Row) => {
      pendingInsert = { id: `id_${db.inserts.length + 1}`, ...row };
      db.inserts.push({ table, row: pendingInsert });
      db.tables[table] = [...(db.tables[table] ?? []), { created_at: new Date().toISOString(), ...pendingInsert }];
      return b;
    },
    update: (patch: Row) => {
      db.updates.push({ table, patch });
      return b;
    },
    single: async () => ({ data: pendingInsert ?? rows[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return b;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (t: string) => builder(t) },
}));

const { runExpiryScan, londonMidnightUtcISO } = await import("./expiry-scan.server");
const { verifyCronRequest } = await import("./cron-auth.server");
const { checkPortalSecret } = await import("./portal-secret.server");

const originalFetch = globalThis.fetch;
let resendStatus = 200;
let sent: any[] = [];

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_dummy";
  db.tables = {
    vehicles: [
      {
        id: "v1",
        reg: "BN20WJL",
        make: "Jaguar",
        model: "I-PACE",
        next_mot_date: "2020-01-01",
        insurance_expiry: null,
      },
    ],
    driver_tracks: [],
    job_runs: [],
  };
  db.inserts = [];
  db.updates = [];
  sent = [];
  resendStatus = 200;
  globalThis.fetch = mock(async (url: any, init?: RequestInit) => {
    if (String(url).includes("api.resend.com")) {
      sent.push(JSON.parse(init?.body as string));
      return new Response(
        JSON.stringify(resendStatus === 200 ? { id: "msg_1" } : { message: "domain not verified" }),
        {
          status: resendStatus,
        },
      );
    }
    return new Response("{}", { status: 200 });
  }) as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("londonMidnightUtcISO", () => {
  it("is 23:00Z the previous day during BST and 00:00Z during GMT", () => {
    expect(londonMidnightUtcISO(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-09T23:00:00.000Z");
    expect(londonMidnightUtcISO(new Date("2026-11-08T12:00:00Z"))).toBe("2026-11-08T00:00:00.000Z");
  });
});

describe("runExpiryScan", () => {
  it("sends ONLY the new Fleet MOT & PCO Expiry Summary to staff, from notifications@, high importance, and logs job_runs", async () => {
    const res = await runExpiryScan({ trigger: "cron" });
    expect(res.ok).toBe(true);
    expect(res.fleetSummaryStatus).toBe("sent");

    const staff = sent.filter((p) => p.to[0] === "admin@fa-ibi.co.uk");
    expect(staff.length).toBe(1);
    expect(staff[0].subject).toStartWith("Fleet MOT & PCO Expiry Summary");
    expect(staff[0].from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
    expect(staff[0].headers).toEqual({
      Importance: "high",
      "X-Priority": "1",
      "X-MSMail-Priority": "High",
    });
    expect(staff[0].html).toContain("FLEET COMPLIANCE");
    expect(staff[0].html).toContain(
      "https://hq.virtual-carhire.co.uk/vehicle-artwork/jaguar-ipace-transparent.png",
    );
    expect(sent.some((p) => /Fleet expiry warning/i.test(p.subject))).toBe(false);

    const jobInsert = db.inserts.find((i) => i.table === "job_runs");
    expect(jobInsert?.row.job_name).toBe("expiry-alerts");
    const jobUpdate = db.updates.find((u) => u.table === "job_runs");
    expect(jobUpdate?.patch.status).toBe("success");
    expect(jobUpdate?.patch.counts.sent).toBeGreaterThanOrEqual(1);
    expect(db.inserts.some((i) => i.table === "email_log" && i.row.status === "sent")).toBe(true);
  });

  it("does not send twice on the same London day for scheduled triggers", async () => {
    db.tables.job_runs = [
      {
        id: "done",
        job_name: "expiry-alerts",
        status: "success",
        started_at: new Date().toISOString(),
      },
    ];
    const res = await runExpiryScan({ trigger: "cron" });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe("already_ran_today");
    expect(sent.length).toBe(0);
  });

  it("manual runs always send, even if today's run already happened", async () => {
    db.tables.job_runs = [
      {
        id: "done",
        job_name: "expiry-alerts",
        status: "success",
        started_at: new Date().toISOString(),
      },
    ];
    const res = await runExpiryScan({ trigger: "manual", force: true });
    expect(res.skipped).toBeUndefined();
    expect(sent.length).toBe(1);
  });

  it("marks the job_runs row failed (with error_message) when the fleet summary cannot be sent", async () => {
    resendStatus = 403;
    const res = await runExpiryScan({ trigger: "cron" });
    expect(res.ok).toBe(false);
    expect(res.fleetSummaryStatus).toBe("failed");
    const jobUpdate = db.updates.find((u) => u.table === "job_runs");
    expect(jobUpdate?.patch.status).toBe("failed");
    expect(String(jobUpdate?.patch.error_message)).toContain("domain not verified");
    expect(db.inserts.some((i) => i.table === "email_log" && i.row.status === "failed")).toBe(true);
  });
});

describe("cron + portal shared-secret checks", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://x/api", { method: "POST", headers });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.PORTAL_SHARED_SECRET;
  });

  it("reports missing_config when CRON_SECRET is not set (no hard-coded fallback)", () => {
    const r = verifyCronRequest(req({ "X-Cron-Secret": "old-hardcoded-default" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("missing_config");
  });

  it("accepts X-Cron-Secret or Bearer and rejects a mismatch", () => {
    process.env.CRON_SECRET = "abc123";
    expect(verifyCronRequest(req({ "X-Cron-Secret": "abc123" })).ok).toBe(true);
    expect(verifyCronRequest(req({ Authorization: "Bearer abc123" })).ok).toBe(true);
    const bad = verifyCronRequest(req({ "X-Cron-Secret": "nope" }));
    expect(!bad.ok && bad.code).toBe("secret_mismatch");
  });

  it("portal secret: missing_config / missing_header / secret_mismatch / ok", () => {
    let r = checkPortalSecret(req({}));
    expect(!r.ok && r.code).toBe("missing_config");
    process.env.PORTAL_SHARED_SECRET = "s3cret";
    r = checkPortalSecret(req({}));
    expect(!r.ok && r.code).toBe("missing_header");
    r = checkPortalSecret(req({ "X-Portal-Secret": "wrong" }));
    expect(!r.ok && r.code).toBe("secret_mismatch");
    expect(checkPortalSecret(req({ "X-Portal-Secret": "s3cret" })).ok).toBe(true);
  });
});

describe("rent due tomorrow", () => {
  const tomorrowName = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "Europe/London" }).format(
    new Date(Date.now() + 86400000),
  );

  it("emails the driver and sends admin a summary, both from notifications@ and high importance, once per day", async () => {
    db.tables.vehicles = [];
    db.tables.driver_tracks = [
      {
        id: "d1",
        driver_name: "Sam Driver",
        email: "sam@example.com",
        reg: "AB12CDE",
        active: true,
        status: "active",
        deleted_at: null,
        weekly_rent: 260,
        rent_due_day: tomorrowName,
        start_date: "2026-01-05",
        rent_status: "unpaid",
      },
    ];

    const res = await runExpiryScan({ trigger: "manual", force: true });
    expect(res.rentDueItems).toBe(1);

    const toDriver = sent.filter((p) => p.to[0] === "sam@example.com");
    const toAdmin = sent.filter((p) => p.to[0] === "admin@fa-ibi.co.uk");
    expect(toDriver.length).toBe(1);
    expect(toAdmin.length).toBe(1);
    for (const p of [...toDriver, ...toAdmin]) {
      expect(p.from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
      expect(p.headers).toEqual({ Importance: "high", "X-Priority": "1", "X-MSMail-Priority": "High" });
    }
    expect(toDriver[0].subject).toContain("rent is due tomorrow");
    expect(toDriver[0].html).toContain("260.00");
    expect(toAdmin[0].subject).toContain("Rent Due Tomorrow Summary");
    expect(toAdmin[0].html).toContain("Sam Driver");
    expect(db.inserts.some((i) => i.table === "driver_notifications" && i.row.type === "rent_due")).toBe(true);

    // A second run the same day must not email the driver again.
    sent = [];
    await runExpiryScan({ trigger: "manual", force: true });
    expect(sent.filter((p) => p.to[0] === "sam@example.com").length).toBe(0);
  });
});

