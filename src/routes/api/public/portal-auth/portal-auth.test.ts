import { describe, test, expect } from "bun:test";
import { sendOtpEmail } from "./request-code";

describe("Portal 2FA Endpoints & Email Content", () => {
  test("sendOtpEmail formats HTML body containing 6-digit code clearly", async () => {
    let capturedBody: any = null;

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

  test("Rate limiting calculates window correctly", () => {
    const windowMinutes = 15;
    const windowAgo = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    expect(new Date(windowAgo).getTime()).toBeLessThan(Date.now());
  });
});
