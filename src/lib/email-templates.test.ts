import { describe, expect, it } from "bun:test";
import {
  render2FAVerificationEmail,
  renderReminderAlertEmail,
} from "./email-templates";

describe("Branded Email Templates", () => {
  it("renders 2FA Verification Email correctly with real logo and required sections", () => {
    const html = render2FAVerificationEmail({
      code: "482 910",
      userName: "Alex",
    });

    expect(html).toContain("https://virtual-carhire.co.uk/assets/logo.png");
    expect(html).toContain("FLEET TRACKER");
    expect(html).toContain("Here's your verification code.");
    expect(html).toContain("Use the code below to complete your verification and get started with Virtual Car Hire Fleet Tracker.");
    expect(html).toContain("Hi Alex,");
    expect(html).toContain("YOUR VERIFICATION CODE");
    expect(html).toContain("482 910");
    expect(html).toContain("This code expires in 10 minutes.");
    expect(html).toContain("If you didn't request this, you can safely ignore this email.");
    expect(html).toContain("Secure");
    expect(html).toContain("Track");
    expect(html).toContain("Smarter Fleet Management");
  });

  it("renders Reminder/Alert Notification Email with cards layout", () => {
    const html = renderReminderAlertEmail({
      userName: "Driver Sam",
      badgeLabel: "IMPORTANT REMINDER",
      headline: "Your MOT & PCO expiry dates are approaching.",
      subtext: "Please submit updated documentation or arrange testing as soon as possible.",
      intro: "Here is your upcoming expiry alert:",
      cards: [
        {
          type: "MOT Expiry",
          date: "15 Oct 2026",
          vehicleReg: "RE70 VCH",
          expiringInDays: 7,
          icon: "mot",
        },
        {
          type: "PCO Licence Expiry",
          date: "20 Oct 2026",
          vehicleReg: "RE70 VCH",
          expiringInDays: 12,
          icon: "pco",
        },
      ],
      warningCallout: "Failure to maintain valid MOT or PCO will result in vehicle suspension.",
    });

    expect(html).toContain("https://virtual-carhire.co.uk/assets/logo.png");
    expect(html).toContain("IMPORTANT REMINDER");
    expect(html).toContain("Your MOT & PCO expiry dates are approaching.");
    expect(html).toContain("Hi Driver Sam,");
    expect(html).toContain("MOT Expiry");
    expect(html).toContain("15 Oct 2026");
    expect(html).toContain("RE70 VCH");
    expect(html).toContain("Expiring in 7 days");
    expect(html).toContain("PCO Licence Expiry");
    expect(html).toContain("Failure to maintain valid MOT or PCO will result in vehicle suspension.");
    expect(html).toContain("Secure");
    expect(html).toContain("Track");
    expect(html).toContain("Smarter Fleet Management");
  });

  it("renders Reminder Email with simple message layout fallback", () => {
    const html = renderReminderAlertEmail({
      headline: "Custom Portal Reminder",
      message: "You have a new unread document in your driver portal.",
    });

    expect(html).toContain("https://virtual-carhire.co.uk/assets/logo.png");
    expect(html).toContain("Custom Portal Reminder");
    expect(html).toContain("You have a new unread document in your driver portal.");
    expect(html).toContain("Secure");
    expect(html).toContain("Track");
    expect(html).toContain("Smarter Fleet Management");
  });
});
