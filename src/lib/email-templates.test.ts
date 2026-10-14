import { describe, expect, it } from "bun:test";
import {
  render2FATemplate,
  renderRentDueTomorrowTemplate,
  renderDriverAlertTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  VCH_HEADER_LOGO_URL,
  VCH_FOOTER_LOGO_URL,
} from "./email-templates";

describe("Email Templates Foundation", () => {
  it("uses logo-header.png and logo-footer.png URLs across templates", () => {
    expect(VCH_HEADER_LOGO_URL).toBe("https://hq.virtual-carhire.co.uk/email/logo-header.png");
    expect(VCH_FOOTER_LOGO_URL).toBe("https://hq.virtual-carhire.co.uk/email/logo-footer.png");
  });

  describe("Template 1: 2FA Verification Code", () => {
    it("renders verification code, expiry note, warning line, and logo header/footer without hero image or generic driver text", () => {
      const html = render2FATemplate({ code: "849201", recipientName: "John" });
      expect(html).toContain("849201");
      expect(html).toContain("Your verification code");
      expect(html).toContain("This code expires in 10 minutes");
      expect(html).toContain("If you didn't request this, ignore this email. Never share this code.");
      expect(html).toContain(VCH_HEADER_LOGO_URL);
      expect(html).toContain(VCH_FOOTER_LOGO_URL);
      expect(html).not.toContain("hero.jpg");
      expect(html).not.toContain("whatsapp/virtual-car-hire-welcome.jpg");
      expect(html).not.toContain("Important Requirement");
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
        actionText: "View Details",
      });

      expect(html).toContain("RENT REMINDER");
      expect(html).toContain("Rent due tomorrow");
      expect(html).toContain("Michael Smith");
      expect(html).toContain("KN73XLB");
      expect(html).toContain("£260.00");
      expect(html).toContain("UNPAID");
      expect(html).toContain("View Details");
      expect(html).toContain(VCH_HEADER_LOGO_URL);
      expect(html).toContain(VCH_FOOTER_LOGO_URL);
      expect(html).not.toContain("hero.jpg");
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
      expect(html).toContain(VCH_HEADER_LOGO_URL);
      expect(html).toContain(VCH_FOOTER_LOGO_URL);
      expect(html).not.toContain("hero.jpg");
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
      expect(html).toContain(VCH_HEADER_LOGO_URL);
      expect(html).toContain(VCH_FOOTER_LOGO_URL);
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
      expect(html).toContain(VCH_HEADER_LOGO_URL);
      expect(html).toContain(VCH_FOOTER_LOGO_URL);
    });
  });
});
