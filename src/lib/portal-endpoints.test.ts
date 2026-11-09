import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

/**
 * Driver portal data + odometer submission endpoints (CRM side), with Supabase faked.
 */
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
const uploads: { bucket: string; path: string; type: string }[] = [];
let failColumns: string[] = []; // simulate a table that lacks these columns

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  let op: "select" | "insert" | "update" = "select";
  let patch: Row = {};
  let inserted: Row | null = null;
  let insertError: { message: string } | null = null;
  const b: any = {
    select: () => b,
    eq: (c: string, v: any) => ((rows = rows.filter((r) => r[c] === v)), b),
    is: (c: string, v: any) => ((rows = rows.filter((r) => (r[c] ?? null) === v)), b),
    ilike: (c: string, v: any) => ((rows = rows.filter((r) => String(r[c] || "").toLowerCase() === String(v).toLowerCase())), b),
    in: (c: string, vals: any[]) => ((rows = rows.filter((r) => vals.includes(r[c]))), b),
    order: () => b,
    limit: (n: number) => ((rows = rows.slice(0, n)), b),
    insert: (row: Row) => {
      op = "insert";
      const bad = Object.keys(row).find((k) => failColumns.includes(k));
      if (bad) {
        insertError = { message: `Could not find the '${bad}' column of '${table}' in the schema cache` };
        return b;
      }
      inserted = { id: `${table}_${(tables[table]?.length ?? 0) + 1}`, ...row };
      tables[table] = [...(tables[table] ?? []), inserted];
      return b;
    },
    update: (p: Row) => ((op = "update"), (patch = p), b),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => (insertError ? { data: null, error: insertError } : { data: inserted ?? rows[0] ?? null, error: null }),
    then: (resolve: any) => {
      if (op === "update") for (const r of rows) Object.assign(r, patch);
      return resolve({ data: rows, error: null });
    },
  };
  return b;
}

mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (t: string) => builder(t),
    auth: {
      getUser: async (token: string) =>
        token === "a.valid.token"
          ? { data: { user: { id: "user-1", email: "Sam@Example.com" } }, error: null }
          : { data: { user: null }, error: { message: "invalid JWT" } },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts: any) => {
          uploads.push({ bucket, path, type: opts.contentType });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn.test/signed/${path}` } }),
      }),
      createBucket: async () => ({ error: null }),
    },
  },
}));

const { Route: meRoute } = await import("@/routes/api/public/portal/me");
const { Route: mileageRoute } = await import("@/routes/api/public/portal/mileage");
const call = (route: any, body: unknown, headers: Record<string, string> = {}) =>
  route.options.server.handlers.POST({
    request: new Request("https://hq.test/api/public/portal/x", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Portal-Secret": "s3cret", "X-Driver-Token": "a.valid.token", ...headers },
      body: JSON.stringify(body),
    }),
  });

const tinyJpeg = "data:image/jpeg;base64," + btoa("fake-jpeg-bytes");
const originalFetch = globalThis.fetch;

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  uploads.length = 0;
  failColumns = [];
  process.env.PORTAL_SHARED_SECRET = "s3cret";
  delete process.env.GEMINI_API_KEY;
  globalThis.fetch = mock(async () => new Response("{}", { status: 500 })) as any;
  tables.driver_tracks = [
    {
      id: "d1",
      auth_user_id: null, // linked by email only
      email: "sam@example.com",
      driver_name: "Sam Driver",
      reg: "AB12CDE",
      vehicle_id: "v1",
      active: true,
      deleted_at: null,
      weekly_rent: 260,
      rent_due_day: "Monday",
      start_date: "2026-01-05",
      rent_status: "unpaid",
      balance_due: 260,
      current_mileage: 41000,
      allowance: 5000,
      rate_pence: 15,
    },
  ];
  tables.vehicles = [{ id: "v1", reg: "AB12CDE", make: "Toyota", model: "Prius", next_mot_date: "2027-01-01" }];
  tables.driver_charges = [
    { id: "c1", driver_id: "d1", amount: 40, description: "PCN" },
    { id: "c2", driver_id: "d1", amount: 99, description: "old", status: "paid" },
  ];
  tables.driver_notifications = [
    { id: "n1", driver_id: "d1", type: "rent_due", title: "Rent Payment Due Tomorrow", message: "£260", read: false, created_at: "2026-11-08T09:00:00Z" },
  ];
  tables.driver_documents = [{ id: "doc1", driver_id: "d1", file_path: "d1/contract.pdf", document_type: "contract", file_name: "contract.pdf" }];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("/api/public/portal/me", () => {
  it("rejects calls without the shared secret or a valid driver token", async () => {
    expect((await call(meRoute, {}, { "X-Portal-Secret": "nope" })).status).toBe(401);
    expect((await call(meRoute, {}, { "X-Driver-Token": "bad.token.x" })).status).toBe(401);
  });

  it("returns the driver's real rent, next due date, vehicle, charges, notifications and documents", async () => {
    const res = await call(meRoute, { mark_read: true });
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.driver.name).toBe("Sam Driver"); // found by email even without auth_user_id
    expect(d.driver.weekly_rent).toBe(260);
    expect(d.driver.rent_due_day).toBe("Monday");
    expect(d.driver.next_due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(d.driver.next_due_date).getUTCDay()).toBe(1);
    expect(d.driver.balance_due).toBe(260);
    expect(d.vehicle).toMatchObject({ reg: "AB12CDE", make: "Toyota", model: "Prius" });
    expect(d.charges).toEqual([{ id: "c1", description: "PCN", amount: 40, created_at: undefined }]);
    expect(d.notifications[0].title).toBe("Rent Payment Due Tomorrow");
    expect(d.documents[0].url).toBe("https://cdn.test/signed/d1/contract.pdf");
    expect(tables.driver_notifications[0].read).toBe(true); // marked read
  });
});

describe("/api/public/portal/mileage", () => {
  it("stores the photo, records the driver's reading and creates a pending CRM review row", async () => {
    const res = await call(mileageRoute, { reading: 41250, photo_base64: tinyJpeg });
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(d.ok).toBe(true);
    expect(uploads[0]).toMatchObject({ bucket: "mileage-photos", type: "image/jpeg" });
    const row = tables.mileage_submissions[0];
    expect(row).toMatchObject({
      driver_id: "d1",
      driver_name: "Sam Driver",
      registration: "AB12CDE",
      status: "pending",
      reading_value: 41250,
      image_path: uploads[0].path,
    });
    expect(row.photo_url).toBe(`https://cdn.test/mileage-photos/${uploads[0].path}`);
    expect(row.ocr_confidence).toBe("none"); // no AI key in tests; staff still review
  });

  it("still saves when the table lacks the website columns", async () => {
    failColumns = ["image_path", "reading_value"];
    const res = await call(mileageRoute, { reading: 41250, photo_base64: tinyJpeg });
    expect(res.status).toBe(200);
    expect(tables.mileage_submissions[0].notes).toContain("41,250");
  });

  it("validates the reading and the photo", async () => {
    expect((await call(mileageRoute, { reading: -5, photo_base64: tinyJpeg })).status).toBe(400);
    expect((await call(mileageRoute, { reading: 41000, photo_base64: "not-an-image" })).status).toBe(400);
  });
});
