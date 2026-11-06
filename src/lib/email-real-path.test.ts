import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { sendEmailDirect } from "./email-sender.server";
import {
  render2FATemplate,
  renderRentDueTomorrowTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  renderDriverAlertTemplate,
} from "./email-templates";

describe("Unified Outbound Email Path (sendEmailDirect + email-templates)", () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.RESEND_API_KEY;
  let interceptedPayloads: any[] = [];

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_dummy_key_12345678";
    interceptedPayloads = [];

    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("api.resend.com/emails")) {
        const parsedBody = JSON.parse(init?.body as string);
        interceptedPayloads.push(parsedBody);
        return new Response(
          JSON.stringify({ id: "msg_resend_mock_123456" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalApiKey !== undefined) {
      process.env.RESEND_API_KEY = originalApiKey;
    } else {
      delete process.env.RESEND_API_KEY;
    }
  });

  it("1. sends 2FA Verification Code email with auth@fa-ibi.co.uk sender and large 6-digit code", async () => {
    const code = "782049";
    const html = render2FATemplate({ code, recipientName: "Test Driver" });
    const text = `Your Virtual Car Hire verification code is: ${code}. This code expires in 10 minutes.`;

    const res = await sendEmailDirect({
      recipient: "driver@example.com",
      subject: `Your Virtual Car Hire verification code: ${code}`,
      emailType: "2fa_code",
      html,
      text,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe("sent");
    expect(interceptedPayloads.length).toBe(1);

    const payload = interceptedPayloads[0];
    expect(payload.from).toBe("Virtual Car Hire <auth@fa-ibi.co.uk>");
    expect(payload.to).toEqual(["driver@example.com"]);
    expect(payload.subject).toContain("782049");
    expect(payload.html).toContain("782049");
    expect(payload.html).toContain("This code expires in 10 minutes");
    expect(payload.text).toContain("782049");
  });

  it("2. sends Fleet Expiry Summary email to admin@fa-ibi.co.uk with notifications@fa-ibi.co.uk sender and high priority", async () => {
    const html = renderFleetSummaryTemplate({
      headline: "Fleet MOT & PCO Expiry Notice",
      vehicles: [
        {
          registration: "KN73XLB",
          model: "Mercedes EQE",
          motExpiry: "2026-11-01",
          motDaysRemaining: 5,
        },
      ],
    });

    const res = await sendEmailDirect({
      recipient: "admin@fa-ibi.co.uk",
      subject: "Fleet Compliance Notice",
      emailType: "fleet_summary",
      html,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe("sent");
    expect(interceptedPayloads.length).toBe(1);

    const payload = interceptedPayloads[0];
    expect(payload.from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
    expect(payload.to).toEqual(["admin@fa-ibi.co.uk"]);
    expect(payload.headers?.Importance).toBe("high");
    expect(payload.html).toContain("KN73XLB");
    expect(payload.html).toContain("Mercedes EQE");
  });

  it("3. sends Driver Licence Expiry Summary to admin@fa-ibi.co.uk with notifications@fa-ibi.co.uk sender and high priority", async () => {
    const html = renderDriverLicenceSummaryTemplate({
      headline: "Driver Licences Expiring Soon",
      drivers: [
        {
          driverId: "DRV-101",
          name: "John Doe",
          expiryDate: "2026-11-05",
          daysRemaining: 9,
        },
      ],
    });

    const res = await sendEmailDirect({
      recipient: "admin@fa-ibi.co.uk",
      subject: "Driver Licence Expiry Digest",
      emailType: "driver_licence_summary",
      html,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe("sent");
    expect(interceptedPayloads.length).toBe(1);

    const payload = interceptedPayloads[0];
    expect(payload.from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
    expect(payload.to).toEqual(["admin@fa-ibi.co.uk"]);
    expect(payload.headers?.["X-Priority"]).toBe("1");
    expect(payload.html).toContain("John Doe");
    expect(payload.html).toContain("DRV-101");
  });

  it("4. sends Rent Due Tomorrow reminder to driver with notifications@fa-ibi.co.uk sender", async () => {
    const html = renderRentDueTomorrowTemplate({
      recipientName: "Jane Smith",
      drivers: [
        {
          driverName: "Jane Smith",
          reg: "BD73XKP",
          weeklyRent: 280,
          dueDate: "Tomorrow",
          rentStatus: "unpaid",
        },
      ],
    });

    const res = await sendEmailDirect({
      recipient: "janesmith@example.com",
      subject: "Reminder: Rent due tomorrow",
      emailType: "rent_due_tomorrow",
      html,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe("sent");
    expect(interceptedPayloads.length).toBe(1);

    const payload = interceptedPayloads[0];
    expect(payload.from).toBe("Virtual Car Hire <notifications@fa-ibi.co.uk>");
    expect(payload.to).toEqual(["janesmith@example.com"]);
    expect(payload.html).toContain("Jane Smith");
    expect(payload.html).toContain("£280.00");
    expect(payload.html).toContain("BD73XKP");
  });

  it("5. sends Driver Alert / MOT notice with driver-alerts@fa-ibi.co.uk sender", async () => {
    const html = renderDriverAlertTemplate({
      recipientName: "Sam Wilson",
      headline: "Vehicle MOT Notice — AB24XYZ",
      singleMessageBody: "Your vehicle is due for MOT inspection next week.",
    });

    const res = await sendEmailDirect({
      recipient: "sam@example.com",
      subject: "Important MOT Reminder",
      emailType: "driver_alert",
      html,
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe("sent");
    expect(interceptedPayloads.length).toBe(1);

    const payload = interceptedPayloads[0];
    expect(payload.from).toBe("Virtual Car Hire <driver-alerts@fa-ibi.co.uk>");
    expect(payload.to).toEqual(["sam@example.com"]);
    expect(payload.html).toContain("Vehicle MOT Notice — AB24XYZ");
    expect(payload.html).toContain("Your vehicle is due for MOT inspection next week");
  });
});
