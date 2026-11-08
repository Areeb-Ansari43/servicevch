import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import fs from "fs";
import path from "path";
import {
  ALLOWED_SENDER_DOMAIN,
  HIGH_IMPORTANCE_HEADERS,
  getDefaultFromAddress,
  isAllowedSender,
  sendEmailDirect,
} from "./email-sender.server";

const ROOT = path.resolve(__dirname, "../..");

/** Directories that contain code which can send email. */
const SCAN_DIRS = ["src", "supabase/functions", ".github/workflows", "scripts"];
const SCAN_EXT = /\.(ts|tsx|js|mjs|cjs|yml|yaml)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".output")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter(
  (f) => !/\.test\.(ts|tsx)$/.test(f),
);

describe("Email sender domain guard (repo-wide)", () => {
  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no code path references the Resend sandbox sender (resend.dev)", () => {
    const offenders = files.filter((f) => /resend\.dev/i.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("every literal From address is on fa-ibi.co.uk", () => {
    // Matches: from: "x@y", from = 'x@y', FROM = "Name <x@y>", *_FROM: "x@y", "from": "x@y"
    const fromPattern =
      /\b(?:from|[A-Z_]*FROM[A-Z_]*)["']?\s*[:=]\s*["'`]([^"'`\n]*@[^"'`\n]*)["'`]/g;
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(fromPattern)) {
        const value = m[1];
        if (value.includes("${")) continue; // template, validated at runtime by assertAllowedSender
        if (!isAllowedSender(value)) offenders.push(`${path.relative(ROOT, f)}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Resend API is only called from the unified sender (plus the retired, service-role-only edge function)", () => {
    const callers = files
      .filter((f) => fs.readFileSync(f, "utf8").includes("api.resend.com/emails"))
      .map((f) => path.relative(ROOT, f))
      .sort();
    expect(callers).toEqual([
      "src/lib/email-sender.server.ts",
      "supabase/functions/send-email/index.ts",
    ]);
  });
});

describe("Unified sender runtime guard", () => {
  const originalFetch = globalThis.fetch;
  const saved: Record<string, string | undefined> = {};
  const ENV = [
    "RESEND_API_KEY",
    "NOTIFICATIONS_EMAIL_FROM",
    "AUTH_EMAIL_FROM",
    "DRIVER_ALERTS_EMAIL_FROM",
  ];
  let payloads: any[] = [];

  beforeEach(() => {
    for (const k of ENV) saved[k] = process.env[k];
    process.env.RESEND_API_KEY = "re_test_dummy";
    payloads = [];
    globalThis.fetch = mock(async (url: any, init?: RequestInit) => {
      if (String(url).includes("api.resend.com/emails")) {
        payloads.push(JSON.parse(init?.body as string));
        return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("resolves every email type to an fa-ibi.co.uk sender with the Virtual Car Hire display name", () => {
    for (const type of [
      "2fa_code",
      "fleet_summary",
      "driver_licence_summary",
      "rent_due_tomorrow",
      "driver_alert",
      "driver_notice",
    ]) {
      const from = getDefaultFromAddress(type);
      expect(from.startsWith("Virtual Car Hire <")).toBe(true);
      expect(from.endsWith(`@${ALLOWED_SENDER_DOMAIN}>`)).toBe(true);
    }
    expect(getDefaultFromAddress("fleet_summary")).toBe(
      "Virtual Car Hire <notifications@fa-ibi.co.uk>",
    );
  });

  it("ignores an off-domain env override instead of using it", () => {
    process.env.NOTIFICATIONS_EMAIL_FROM = "someone@example.com";
    expect(getDefaultFromAddress("fleet_summary")).toBe(
      "Virtual Car Hire <notifications@fa-ibi.co.uk>",
    );
  });

  it("refuses an explicit off-domain From and never calls Resend", async () => {
    const res = await sendEmailDirect({
      recipient: "staff@example.com",
      from: "Someone <someone@example.com>",
      subject: "x",
      html: "<p>x</p>",
      emailType: "driver_alert",
    });
    expect(res.status).toBe("failed");
    expect(payloads.length).toBe(0);
  });

  it("sends the fleet summary from notifications@ with high-importance headers", async () => {
    const res = await sendEmailDirect({
      recipient: "admin@fa-ibi.co.uk",
      subject: "Fleet MOT & PCO Expiry Summary — 1 vehicle(s)",
      html: "<p>x</p>",
      emailType: "fleet_summary",
    });
    expect(res.status).toBe("sent");
    expect(payloads[0].from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
    expect(payloads[0].headers).toEqual({ ...HIGH_IMPORTANCE_HEADERS });
  });
});
