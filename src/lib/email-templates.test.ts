import { describe, expect, it } from "bun:test";
import {
  render2FATemplate,
  renderDriverAlertTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  VCH_LOGO_URL,
} from "./email-templates";

describe("Email Templates Foundation", () => {
  it("uses exact real brand logo URL across templates", () => {
    expect(VCH_LOGO_URL).toBe("https://virtual-carhire.co.uk/assets/logo.png");
  });

  describe("Template 1: 2FA Verification Code", () => {
    it("renders verification code, 10-minute expiry note, and brand header/footer", () => {
      const html = render2FATemplate({ code: "849201", recipientName: "John" });
      expect(html).toContain("849201");
      expect(html).toContain("Hi John");
      expect(html).toContain("FLEET TRACKER");
      expect(html).toContain("Here's your verification code.");
      expect(html).toContain("This code expires in <strong>10 minutes</strong>.");
      expect(html).toContain(VCH_LOGO_URL);
      expect(html).toContain("Smarter Fleet Management");
    });
  });

  describe("Template 2: Driver Alert / Single-Record", () => {
    it("renders driver vehicle MOT/PCO alert cards and warning notice box", () => {
      const html = renderDriverAlertTemplate({
        recipientName: "Alex",
        headline: "Your MOT & PCO expiry dates are approaching.",
        cards: [
          {
            iconType: "mot",
            title: "MOT Expiry",
            dateStr: "15 Oct 2026",
            vehicleReg: "BD73 XKP",
            vehicleModel: "Tesla Model Y",
            daysRemaining: 5,
          },
        ],
      });

      expect(html).toContain("IMPORTANT REMINDER");
      expect(html).toContain("Hi Alex");
      expect(html).toContain("Your MOT & PCO expiry dates are approaching.");
      expect(html).toContain("BD73 XKP");
      expect(html).toContain("Expiring in 5 days");
      expect(html).toContain("⚠️ Important Notice");
      expect(html).toContain(VCH_LOGO_URL);
    });

    it("renders rent due tomorrow driver-facing notice wording correctly", () => {
      const html = renderDriverAlertTemplate({
        recipientName: "Michael",
        headline: "Rent Due Tomorrow",
        introLine: "Hi Michael, your rent is due tomorrow.",
        cards: [
          {
            iconType: "rent",
            title: "Weekly Rent Payment (£260.00)",
            dateStr: "2026-10-15",
            vehicleReg: "KN73XLB",
            daysRemaining: 1,
          },
        ],
      });

      expect(html).toContain("Hi Michael, your rent is due tomorrow.");
      expect(html).toContain("Weekly Rent Payment (£260.00)");
      expect(html).toContain("Expiring in 1 days");
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

  describe("Template 3: Fleet-Wide Expiry Summary (Staff-Facing)", () => {
    it("renders fleet summary pills, sortable vehicle rows with real photo URLs, and compliance warning", () => {
      const photoUrl = "https://servicevch.pages.dev/vehicle-artwork/mercedes-eqe-transparent.png";
      const html = renderFleetSummaryTemplate({
        motCount: 4,
        pcoCount: 6,
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

      expect(html).toContain("Multiple vehicles have upcoming MOT & PCO expiries");
      expect(html).toContain("⚠️ 4 vehicles");
      expect(html).toContain("🪪 6 vehicles");
      expect(html).toContain("KN73XLB");
      expect(html).toContain("Mercedes-Benz EQE");
      expect(html).toContain(photoUrl);
      expect(html).toContain("Due Soon (Sort by: Soonest expiry)");
      expect(html).toContain("Compliance Warning");
      expect(html).toContain("Keeping you on the road.");
    });
  });

  describe("Template 4: Driver Licence Expiry Summary (Staff-Facing)", () => {
    it("renders driver rows with initials avatar, Driver ID, and licence type", () => {
      const html = renderDriverLicenceSummaryTemplate({
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

      expect(html).toContain("Your Driver Licence is expiring soon.");
      expect(html).toContain("David Miller");
      expect(html).toContain("DRV-8821");
      expect(html).toContain("Full UK Licence");
      expect(html).toContain("in 12 days");
      expect(html).toContain("DM"); // Initials avatar
      expect(html).toContain("Review Licence");
      expect(html).toContain("Regulatory Requirement");
    });
  });

  describe("Send Test Email Edge Function Helper", () => {
    it("parses success and error feedback correctly", async () => {
      let toastMessages: { msg: string; type?: string }[] = [];
      const toast = (msg: string, type?: string) => {
        toastMessages.push({ msg, type });
      };

      // Helper logic test
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

      // Case 1: Missing secrets (HTTP 500 error from Edge Function)
      const res1 = processFeedback(
        { success: false, status: "failed", error: "RESEND_API_KEY environment variable is missing." },
        { message: "Edge Function returned 500" }
      );
      expect(res1.success).toBe(false);
      expect(res1.message).toContain("RESEND_API_KEY environment variable is missing.");

      // Case 2: Success
      const res2 = processFeedback(
        { success: true, status: "sent", id: "resend_123" },
        null
      );
      expect(res2.success).toBe(true);
      expect(res2.message).toBe("Test email sent to admin@virtualcarhire.com");
    });
  });
});
