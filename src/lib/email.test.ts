import { describe, expect, it } from "bun:test";
import {
  generateEmailHTMLPreview,
  sendEmail,
  send2FAVerificationEmail,
  sendReminderAlertEmail,
} from "./email";

describe("Email Helper Functions & Client Library", () => {
  it("generates 2FA verification email preview HTML correctly", () => {
    const html = generateEmailHTMLPreview("2fa_verification", {
      code: "918 273",
      userName: "Jane",
    });

    expect(html).toContain("https://virtual-carhire.co.uk/assets/logo.png");
    expect(html).toContain("FLEET TRACKER");
    expect(html).toContain("918 273");
    expect(html).toContain("Hi Jane,");
    expect(html).toContain("Secure");
    expect(html).toContain("Track");
    expect(html).toContain("Smarter Fleet Management");
  });

  it("generates reminder alert email preview HTML correctly", () => {
    const html = generateEmailHTMLPreview("reminder", {
      userName: "David",
      headline: "Your PCO Licence is Expiring Soon",
      cards: [
        {
          type: "PCO Licence Expiry",
          date: "10 Nov 2026",
          vehicleReg: "LS69 XYZ",
          expiringInDays: 14,
        },
      ],
    });

    expect(html).toContain("https://virtual-carhire.co.uk/assets/logo.png");
    expect(html).toContain("Your PCO Licence is Expiring Soon");
    expect(html).toContain("Hi David,");
    expect(html).toContain("PCO Licence Expiry");
    expect(html).toContain("10 Nov 2026");
    expect(html).toContain("LS69 XYZ");
    expect(html).toContain("Expiring in 14 days");
    expect(html).toContain("Secure");
    expect(html).toContain("Track");
    expect(html).toContain("Smarter Fleet Management");
  });

  it("handles missing recipient in sendEmail gracefully without throwing", async () => {
    const result = await sendEmail({});
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Recipient email address is required");
  });
});
