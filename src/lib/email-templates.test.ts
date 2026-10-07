import { describe, expect, it } from "bun:test";
import {
  render2FATemplate,
  renderRentDueTomorrowTemplate,
  renderDriverAlertTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  VCH_LOGO_URL,
  HERO_IMAGE_URL,
} from "./email-templates";

describe("Email Templates Foundation", () => {
  it("uses exact real brand logo and hero image URLs across templates", () => {
    expect(VCH_LOGO_URL).toBe("https://www.virtual-carhire.co.uk/assets/logo.png");
    expect(HERO_IMAGE_URL).toBe("https://hq.virtual-carhire.co.uk/whatsapp/virtual-car-hire-welcome.jpg");
  });

  describe("Template 1: 2FA Verification Code", () => {
    it("renders verification code, expiry note, hero image, and 96x96 PNG logo", () => {
      const html = render2FATemplate({ code: "849201", recipientName: "John" });
      expect(html).toContain("849201");
      expect(html).toContain("Hi John");
      expect(html).toContain("SECURITY VERIFICATION");
      expect(html).toContain("Your Security Verification Code");
      expect(html).toContain("Code expires in");
      expect(html).toContain(VCH_LOGO_URL);
      expect(html).toContain(HERO_IMAGE_URL);
      expect(html).toContain("Smarter Fleet Management");
    });
  });

  describe("Template 2: Rent Due Tomorrow", () => {
    it("renders rent reminder eyebrow, rent due tomorrow headline, driver row table, and CTA button", () => {
      const html = renderRentDueTomorrowTemplate({
        recipientName: "Michael",
        headline: "Rent due tomorrow",
        subtext: "The following active drivers have weekly rent due tomorrow:",
        drivers: [
          {
            driverName: "Michael Smith",
            reg: "KN73XLB",
            vehicleModel: "Mercedes-Benz EQE",
            weeklyRent: 260,
            dueDate: "Tomorrow",
            rentStatus: "unpaid",
          },
        ],
        actionUrl: "https://virtual-carhire.co.uk/portal/dashboard",
        actionText: "View Drivers",
      });

      expect(html).toContain("RENT REMINDER");
      expect(html).toContain("Rent due tomorrow");
      expect(html).toContain("Michael Smith");
      expect(html).toContain("KN73XLB");
      expect(html).toContain("£260.00");
      expect(html).toContain("UNPAID");
      expect(html).toContain("View Drivers");
      expect(html).toContain(VCH_LOGO_URL);
      expect(html).toContain(HERO_IMAGE_URL);
    });
  });

  describe("Template 3: Driver Alert / Single-Record Notice", () => {
    it("renders driver vehicle alert cards and warning notice box", () => {
      const html = renderDriverAlertTemplate({
        recipientName: "Alex",
        headline: "Vehicle Expiry Notice",
        headerLabel: "IMPORTANT NOTICE",
        cards: [
          {
            iconType: "mot",
            title: "MOT Inspection Due",
            dateStr: "15 Oct 2026",
            vehicleReg: "BD73 XKP",
            vehicleModel: "Tesla Model Y",
            daysRemaining: 5,
          },
        ],
      });

      expect(html).toContain("IMPORTANT NOTICE");
      expect(html).toContain("Hi Alex");
      expect(html).toContain("Vehicle Expiry Notice");
      expect(html).toContain("BD73 XKP");
      expect(html).toContain("Expiring in 5 days");
      expect(html).toContain("⚠️ Important Requirement");
      expect(html).toContain(VCH_LOGO_URL);
      expect(html).toContain(HERO_IMAGE_URL);
    });

    it("renders simplified single message body when no cards are provided", () => {
      const html = renderDriverAlertTemplate({
        recipientName: "Sarah",
        headline: "Please check your driver portal",
        singleMessageBody: "We have updated your weekly rent schedule. Please review your portal documents.",
      });

      expect(html).toContain("Hi Sarah");
      expect(html).toContain("Please check your driver portal");
      expect(html).toContain("We have updated your weekly rent schedule.");
    });
  });

  describe("Template 4: Fleet-Wide Expiry Summary (Staff-Facing)", () => {
    it("renders fleet summary eyebrow, vehicle rows with photos, and CTA", () => {
      const photoUrl = "https://virtual-carhire.co.uk/vehicle-artwork/mercedes-eqe-transparent.png";
      const html = renderFleetSummaryTemplate({
        headerLabel: "FLEET COMPLIANCE",
        headline: "Multiple vehicles have upcoming MOT & PCO expiries",
        vehicles: [
          {
            registration: "KN73XLB",
            model: "Mercedes-Benz EQE",
            photoUrl,
            motExpiry: "2026-10-12",
            motDaysRemaining: 8,
            pcoExpiry: "2026-10-20",
            pcoDaysRemaining: 16,
          },
        ],
      });

      expect(html).toContain("FLEET COMPLIANCE");
      expect(html).toContain("Multiple vehicles have upcoming MOT & PCO expiries");
      expect(html).toContain("KN73XLB");
      expect(html).toContain("Mercedes-Benz EQE");
      expect(html).toContain(photoUrl);
      expect(html).toContain("Manage Fleet Expiries");
    });
  });

  describe("Template 5: Driver Licence Expiry Summary (Staff-Facing)", () => {
    it("renders driver rows with initials avatar, Driver ID, and licence type", () => {
      const html = renderDriverLicenceSummaryTemplate({
        headline: "Driver Licences Expiring Soon",
        drivers: [
          {
            driverId: "DRV-8821",
            name: "David Miller",
            licenceType: "Full UK Licence",
            expiryDate: "2026-10-30",
            daysRemaining: 12,
          },
        ],
      });

      expect(html).toContain("LICENCE COMPLIANCE");
      expect(html).toContain("Driver Licences Expiring Soon");
      expect(html).toContain("David Miller");
      expect(html).toContain("DRV-8821");
      expect(html).toContain("Full UK Licence");
      expect(html).toContain("in 12d");
      expect(html).toContain("DM");
      expect(html).toContain("Review All Licences");
    });
  });

  describe("Send Test Email Edge Function Helper", () => {
    it("parses success and error feedback correctly", async () => {
      const processFeedback = (
        data: any,
        error: any
      ): { success: boolean; message: string } => {
        if (error) {
          let detailedError = error.message || "Invoke failed";
          if (data && typeof data === "object") {
            if (data.error) detailedError = data.error;
            else if (data.message) detailedError = data.message;
          }
          return { success: false, message: `Failed to send test email: ${detailedError}` };
        }
        if (data && typeof data === "object") {
          if (data.success === false || data.status === "failed") {
            const msg = data.error || data.message || "Unknown error";
            return { success: false, message: `Failed to send test email: ${msg}` };
          }
        }
        return { success: true, message: "Test email sent to admin@virtualcarhire.com" };
      };

      const res1 = processFeedback(
        { success: false, status: "failed", error: "RESEND_API_KEY environment variable is missing." },
        { message: "Edge Function returned 500" }
      );
      expect(res1.success).toBe(false);
      expect(res1.message).toContain("RESEND_API_KEY environment variable is missing.");

      const res2 = processFeedback(
        { success: true, status: "sent", id: "resend_123" },
        null
      );
      expect(res2.success).toBe(true);
      expect(res2.message).toBe("Test email sent to admin@virtualcarhire.com");
    });
  });
});
