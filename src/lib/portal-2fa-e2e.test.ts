import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "fs";
import path from "path";

/**
 * End-to-end (on paper) driver-portal 2FA flow through the CRM endpoints, with Supabase,
 * Resend and WhatsApp faked:
 *   website proxy -> POST request-code (X-Portal-Secret) -> password check (ephemeral client)
 *   -> login_otps row with otp_hash -> code email from auth@ containing the 6 digits
 *   -> POST verify-code -> session tokens -> portal_auth_events audit rows (source Portal)
 */

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
const adminAuthCalls: string[] = [];

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  let op: "select" | "insert" | "update" = "select";
  let patch: Row = {};
  const filters: ((r: Row) => boolean)[] = [];
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => (
      filters.push((r) => r[c] === v),
      (rows = rows.filter((r) => r[c] === v)),
      b
    ),
    gte: (c: string, v: any) => ((rows = rows.filter((r) => String(r[c]) >= String(v))), b),
    or: () => b,
    order: () => ((rows = [...rows].reverse()), b),
    limit: (n: number) => ((rows = rows.slice(0, n)), b),
    insert: (row: Row) => {
      op = "insert";
      tables[table] = [
        ...(tables[table] ?? []),
        {
          id: `${table}_${(tables[table]?.length ?? 0) + 1}`,
          created_at: new Date().toISOString(),
          ...row,
        },
      ];
      return b;
    },
    update: (p: Row) => ((op = "update"), (patch = p), b),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => {
      if (op === "update") {
        for (const r of tables[table] ?? [])
          if (filters.every((f) => f(r))) Object.assign(r, patch);
      }
      return resolve({ data: op === "select" ? rows : null, error: null, count: rows.length });
    },
  };
  return b;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => builder(t),
    auth: {
      signInWithPassword: () => {
        adminAuthCalls.push("signInWithPassword");
        throw new Error("must not be called on supabaseAdmin");
      },
      verifyOtp: () => {
        adminAuthCalls.push("verifyOtp");
        throw new Error("must not be called on supabaseAdmin");
      },
      admin: {
        generateLink: async () => ({
          data: { properties: { hashed_token: "hashed_tok" } },
          error: null,
        }),
      },
    },
  },
}));

mock.module("@/lib/supabase-ephemeral.server", () => ({
  createEphemeralAuthClient: () => ({
    auth: {
      signInWithPassword: async ({ password }: any) =>
        password === "right-password"
          ? { data: { user: { id: "user-1", phone: null } }, error: null }
          : { data: { user: null }, error: { message: "Invalid login credentials", status: 400 } },
      signOut: async () => ({ error: null }),
      verifyOtp: async () => ({
        data: { session: { access_token: "at", refresh_token: "rt" } },
        error: null,
      }),
    },
  }),
}));

const { handleRequestCode } = await import("@/routes/api/public/portal-auth/request-code");
const { handleVerifyCode } = await import("@/routes/api/public/portal-auth/verify-code");

const originalFetch = globalThis.fetch;
let emails: any[] = [];
let resendOk = true;

const post = (body: any, secret = "portal-secret") =>
  new Request("https://hq.virtual-carhire.co.uk/api/public/portal-auth/x", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Portal-Secret": secret,
      "X-Client-IP": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.driver_tracks = [
    {
      id: "d1",
      email: "driver@example.com",
      active: true,
      deleted_at: null,
      phone: null,
      auth_user_id: "user-1",
    },
  ];
  adminAuthCalls.length = 0;
  emails = [];
  resendOk = true;
  process.env.PORTAL_SHARED_SECRET = "portal-secret";
  process.env.PORTAL_OTP_PEPPER = "pepper";
  process.env.RESEND_API_KEY = "re_dummy";
  globalThis.fetch = mock(async (url: any, init?: RequestInit) => {
    if (String(url).includes("api.resend.com")) {
      emails.push(JSON.parse(init?.body as string));
      return resendOk
        ? new Response(JSON.stringify({ id: "msg" }), { status: 200 })
        : new Response(JSON.stringify({ message: "The fa-ibi.co.uk domain is not verified" }), {
            status: 403,
          });
    }
    return new Response("{}", { status: 200 });
  }) as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PORTAL_SHARED_SECRET;
});

describe("Driver portal 2FA end to end", () => {
  it("password -> otp_hash row -> code email from auth@ -> verify -> session -> audit", async () => {
    const r1 = await handleRequestCode(
      post({ email: "Driver@Example.com", password: "right-password" }),
    );
    const j1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(j1.code).toBe("ok");

    const otp = tables.login_otps?.[0];
    expect(otp?.otp_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(otp?.code_hash).toBe(otp?.otp_hash);
    expect(otp?.consumed).toBe(false);

    expect(emails.length).toBe(1);
    expect(emails[0].from).toBe("Virtual Car Hire <auth@fa-ibi.co.uk>");
    const code = String(emails[0].subject).match(/(\d{6})/)?.[1];
    expect(code).toBeDefined();
    expect(emails[0].html).toContain(code!);
    expect(emails[0].text).toContain(code!);
    expect(emails[0].html).toContain("Your verification code");
    expect(emails[0].html).not.toContain("View Details in Portal"); // not the driver-alert template

    const r2 = await handleVerifyCode(post({ email: "driver@example.com", code }));
    const j2 = await r2.json();
    expect(r2.status).toBe(200);
    expect(j2.session).toEqual({ access_token: "at", refresh_token: "rt" });
    expect(tables.login_otps[0].consumed).toBe(true);

    const events = tables.portal_auth_events ?? [];
    expect(events.filter((e) => e.result_code === "SUCCESS").map((e) => e.step)).toEqual([
      "request_code",
      "verify_code",
    ]);
    expect(events.every((e) => e.source === "Portal")).toBe(true);
    expect(adminAuthCalls).toEqual([]); // shared admin client never gets a user session
  });

  it("returns distinct codes: secret_mismatch, invalid_credentials, email_send_failed", async () => {
    let r = await handleRequestCode(
      post({ email: "driver@example.com", password: "right-password" }, "wrong"),
    );
    expect((await r.json()).code).toBe("secret_mismatch");

    r = await handleRequestCode(post({ email: "driver@example.com", password: "bad" }));
    expect((await r.json()).code).toBe("invalid_credentials");

    resendOk = false;
    r = await handleRequestCode(post({ email: "driver@example.com", password: "right-password" }));
    expect(r.status).toBe(502);
    expect((await r.json()).code).toBe("email_send_failed");
    const failed = (tables.portal_auth_events ?? []).find(
      (e) => e.result_code === "EMAIL_SEND_FAILED",
    );
    expect(failed?.step).toBe("email_send");
    expect(failed?.reason).toContain("not verified");
  });

  it("missing PORTAL_SHARED_SECRET on the CRM is reported as missing_config (503), not 'Unauthorized'", async () => {
    delete process.env.PORTAL_SHARED_SECRET;
    const r = await handleRequestCode(post({ email: "driver@example.com", password: "x" }));
    expect(r.status).toBe(503);
    expect((await r.json()).code).toBe("missing_config");
  });

  it("no source file calls signInWithPassword / verifyOtp on supabaseAdmin", () => {
    const root = path.resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) {
          if (
            /supabaseAdmin\.auth\.(signInWithPassword|verifyOtp|signInWithOtp)/.test(
              fs.readFileSync(p, "utf8"),
            )
          )
            offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
