import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { sendOtpEmail } from "./request-code";

describe("Portal Auth Request Code & OTP Delivery", () => {
  const originalFetch = globalThis.fetch;
  let sentPayloads: any[] = [];

  beforeEach(() => {
    sentPayloads = [];
    process.env.RESEND_API_KEY = "re_test_mock_key_12345";

    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("api.resend.com/emails")) {
        const body = JSON.parse((init?.body as string) || "{}");
        sentPayloads.push(body);
        return new Response(JSON.stringify({ id: "resend_test_msg_999" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("sendOtpEmail sends a branded 2FA code email with large 6-digit code in HTML and plain text", async () => {
    const testEmail = "driver.test@example.com";
    const testCode = "849201";

    await sendOtpEmail(testEmail, testCode);

    expect(sentPayloads.length).toBe(1);
    const sent = sentPayloads[0];

    expect(sent.to).toEqual([testEmail]);
    expect(sent.from).toBe("Virtual Car Hire <auth@fa-ibi.co.uk>");
    expect(sent.subject).toContain(testCode);

    // Verify HTML contains large 6-digit code block and expiry notice
    expect(sent.html).toContain(testCode);
    expect(sent.html).toContain("Your verification code");
    expect(sent.html).toContain("This code expires in 10 minutes");
    expect(sent.html).toContain("Never share this code");

    // Verify plain text contains code and warning
    expect(sent.text).toContain(testCode);
    expect(sent.text).toContain("expires in 10 minutes");
  });
});
