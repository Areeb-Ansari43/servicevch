import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import {
  render2FATemplate,
  renderRentDueTomorrowTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  renderDriverAlertTemplate,
} from "../src/lib/email-templates";

async function generateEmailPreviews() {
  const outputDir = path.join(process.cwd(), "design-reference/email-previews");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const localHeaderLogo = `file://${path.join(process.cwd(), "public/email/logo-header.png")}`;
  const localFooterLogo = `file://${path.join(process.cwd(), "public/email/logo-footer.png")}`;

  const templates = [
    {
      name: "2fa-code",
      html: render2FATemplate({
        code: "849201",
        recipientName: "John",
        logoHeaderSrc: localHeaderLogo,
        logoFooterSrc: localFooterLogo,
      }),
    },
    {
      name: "rent-due-tomorrow",
      html: renderRentDueTomorrowTemplate({
        recipientName: "Michael Smith",
        headline: "Rent due tomorrow",
        subtext: "Your weekly rent payment of £260.00 for Mercedes-Benz EQE (KN73XLB) is due tomorrow.",
        drivers: [
          {
            driverName: "Michael Smith",
            reg: "KN73XLB",
            vehicleModel: "Mercedes-Benz EQE",
            weeklyRent: 260.0,
            dueDate: "Tomorrow",
            rentStatus: "unpaid",
          },
        ],
        actionUrl: "https://virtual-carhire.co.uk/portal/dashboard",
        actionText: "View Details",
        logoHeaderSrc: localHeaderLogo,
        logoFooterSrc: localFooterLogo,
      }),
    },
    {
      name: "fleet-summary",
      html: renderFleetSummaryTemplate({
        headerLabel: "FLEET COMPLIANCE",
        headline: "Multiple vehicles have upcoming MOT & PCO expiries (2)",
        subtext: "Ensure your fleet remains road-legal, compliant, and ready for work.",
        vehicles: [
          {
            registration: "KN73XLB",
            model: "Mercedes-Benz EQE",
            photoUrl: `file://${path.join(process.cwd(), "public/logo.png")}`,
            motExpiry: "2026-10-15",
            motDaysRemaining: 5,
            pcoExpiry: "2026-10-20",
            pcoDaysRemaining: 10,
            detailsUrl: "https://hq.virtual-carhire.co.uk/vehicles/KN73XLB",
          },
          {
            registration: "BD73XKP",
            model: "Tesla Model Y",
            motExpiry: "2026-10-18",
            motDaysRemaining: 8,
            pcoExpiry: "2026-10-25",
            pcoDaysRemaining: 15,
            detailsUrl: "https://hq.virtual-carhire.co.uk/vehicles/BD73XKP",
          },
        ],
        manageUrl: "https://hq.virtual-carhire.co.uk/vehicles",
        logoHeaderSrc: localHeaderLogo,
        logoFooterSrc: localFooterLogo,
      }),
    },
    {
      name: "driver-licence-summary",
      html: renderDriverLicenceSummaryTemplate({
        headerLabel: "LICENCE COMPLIANCE",
        headline: "Driver Licences Expiring Soon (2)",
        subtext: "Review driver licence expiry dates across your team and take required action.",
        drivers: [
          {
            driverId: "DRV-1029",
            name: "Alexander Wright",
            licenceType: "Full UK Licence",
            expiryDate: "2026-10-12",
            daysRemaining: 12,
            reviewUrl: "https://hq.virtual-carhire.co.uk/drivers",
          },
          {
            driverId: "DRV-1044",
            name: "David Miller",
            licenceType: "Full UK Licence",
            expiryDate: "2026-10-18",
            daysRemaining: 18,
            reviewUrl: "https://hq.virtual-carhire.co.uk/drivers",
          },
        ],
        helpUrl: "https://hq.virtual-carhire.co.uk/drivers",
        logoHeaderSrc: localHeaderLogo,
        logoFooterSrc: localFooterLogo,
      }),
    },
    {
      name: "driver-alert",
      html: renderDriverAlertTemplate({
        recipientName: "Alexander",
        headerLabel: "IMPORTANT NOTICE",
        headline: "Vehicle Expiry Notice — KN73XLB",
        subtext: "Please review the details below and schedule an inspection.",
        cards: [
          {
            iconType: "mot",
            title: "MOT Inspection Due",
            dateStr: "2026-10-15",
            vehicleReg: "KN73XLB",
            vehicleModel: "Mercedes-Benz EQE",
            daysRemaining: 5,
          },
        ],
        actionUrl: "https://virtual-carhire.co.uk/portal/dashboard",
        actionText: "View Details in Portal",
        logoHeaderSrc: localHeaderLogo,
        logoFooterSrc: localFooterLogo,
      }),
    },
    {
      name: "website-enquiry",
      html: renderDriverAlertTemplate({
        recipientName: "Team",
        headerLabel: "WEBSITE ENQUIRY",
        headline: "New Customer Enquiry Received",
        subtext: "A new rental enquiry has been submitted through virtual-carhire.co.uk.",
        singleMessageBody: "<strong>Name:</strong> John Doe<br/><strong>Phone:</strong> +44 7721 502779<br/><strong>Vehicle Interest:</strong> Mercedes EQE<br/><strong>Note:</strong> Looking to start PCO hire next Monday.",
        actionUrl: "https://hq.virtual-carhire.co.uk",
        actionText: "Open CRM",
        logoHeaderSrc: localHeaderLogo,
        logoFooterSrc: localFooterLogo,
      }),
    },
  ];

  const browser = await chromium.launch();
  const widths = [600, 360];

  for (const t of templates) {
    for (const w of widths) {
      const page = await browser.newPage({ viewport: { width: w, height: 900 } });
      await page.setContent(t.html, { waitUntil: "networkidle" });
      const imgPath = path.join(outputDir, `${t.name}-${w}px.png`);
      await page.screenshot({ path: imgPath, fullPage: true });
      console.log(`Generated: ${imgPath}`);
      await page.close();
    }
  }

  await browser.close();
  console.log("All email previews generated successfully!");
}

generateEmailPreviews().catch((err) => {
  console.error("Error generating previews:", err);
  process.exit(1);
});
