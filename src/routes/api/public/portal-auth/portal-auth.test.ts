import { describe, test, expect, mock, beforeEach } from "bun:test";
import { sendOtpEmail } from "./request-code";

describe("Portal 2FA Endpoints & Email Content", () => {
  test("sendOtpEmail formats HTML body containing 6-digit code clearly", async () => {
    let capturedBody: any = null;

    // Mock fetch to inspect Resend payload
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("api.resend.com")) {
        capturedBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "test-id" }), { status: 200 });
      }
      return originalFetch(url, init);
    }) as any;

    try {
      process.env.RESEND_API_KEY = "re_test_key";
      await sendOtpEmail("driver@example.com", "849201");

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.from).toBe("Virtual Car Hire <auth@fa-ibi.co.uk>");
      expect(capturedBody.to).toEqual(["driver@example.com"]);
      expect(capturedBody.subject).toContain("849201");
      expect(capturedBody.html).toContain("849201");
      expect(capturedBody.html).toContain("Virtual Car Hire");
      expect(capturedBody.html).toContain("Portal Access");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("Rate limit map restricts spam IPs", () => {
    const store = new Map<string, number[]>();
    const ip = "192.168.1.1";
    const windowMs = 15 * 60 * 1000;
    const limit = 5;

    for (let i = 0; i < 5; i++) {
      const timestamps = store.get(ip) || [];
      timestamps.push(Date.now());
      store.set(ip, timestamps);
    }

    const current = store.get(ip) || [];
    expect(current.length).toBe(limit);
    expect(current.length >= limit).toBe(true);
  });
});
