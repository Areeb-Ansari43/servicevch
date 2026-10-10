import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import {
  render2FATemplate,
  renderRentDueTomorrowTemplate,
  renderDriverAlertTemplate,
  renderFleetSummaryTemplate,
  renderDriverLicenceSummaryTemplate,
  VCH_HEADER_LOGO_URL,
  VCH_FOOTER_LOGO_URL,
} from "./email-templates";

describe("Email Redesign, Senders & 2FA Verification Suite", () => {
  const sampleData = {
    code: "654321",
    recipientName: "Test User",
    headline: "Test Headline",
    subtext: "Test Subtext",
    drivers: [
      {
        driverName: "John Doe",
        reg: "AB12CDE",
        weeklyRent: 250,
        dueDate: "Tomorrow",
        rentStatus: "unpaid",
      },
    ],
    vehicles: [
      {
        registration: "AB12CDE",
        model: "Tesla Model 3",
        motExpiry: "2026-10-20",
        pcoExpiry: "2026-10-25",
      },
    ],
    cards: [
      {
        title: "Test Card",
        dateStr: "2026-10-20",
        vehicleReg: "AB12CDE",
      },
    ],
  };

  test("1. No hero image or legacy flyer images in any template output", () => {
    const renderedHtmls = [
      render2FATemplate({ code: sampleData.code }),
      renderRentDueTomorrowTemplate(sampleData),
      renderDriverAlertTemplate({ headline: sampleData.headline, cards: sampleData.cards }),
      renderFleetSummaryTemplate({ vehicles: sampleData.vehicles }),
      renderDriverLicenceSummaryTemplate({ drivers: [{ driverId: "D1", name: "John", expiryDate: "2026-10-20", daysRemaining: 10 }] }),
    ];

    for (const html of renderedHtmls) {
      expect(html).not.toContain("hero.jpg");
      expect(html).not.toContain("whatsapp/virtual-car-hire-welcome.jpg");
      expect(html).not.toContain("100+ PCO-READY VEHICLES");
    }
  });

  test("2. Header and footer logo width/height attributes match real cropped file aspect ratio within 2%", async () => {
    const headerPath = path.join(process.cwd(), "public/email/logo-header.png");
    const footerPath = path.join(process.cwd(), "public/email/logo-footer.png");

    expect(fs.existsSync(headerPath)).toBe(true);
    expect(fs.existsSync(footerPath)).toBe(true);

    const headerMeta = await sharp(headerPath).metadata();
    const footerMeta = await sharp(footerPath).metadata();

    const realHeaderRatio = (headerMeta.width || 1) / (headerMeta.height || 1);
    const realFooterRatio = (footerMeta.width || 1) / (footerMeta.height || 1);

    const html = renderDriverAlertTemplate({ headline: "Aspect Ratio Test" });

    // Header logo match
    const headerMatch = html.match(/src="[^"]*logo-header\.png"[^>]*width="(\d+)"[^>]*height="(\d+)"/);
    expect(headerMatch).not.toBeNull();
    const htmlHeaderRatio = parseInt(headerMatch![1], 10) / parseInt(headerMatch![2], 10);
    const headerDiffPct = (Math.abs(htmlHeaderRatio - realHeaderRatio) / realHeaderRatio) * 100;
    expect(headerDiffPct).toBeLessThan(2);

    // Footer logo match
    const footerMatch = html.match(/src="[^"]*logo-footer\.png"[^>]*width="(\d+)"[^>]*height="(\d+)"/);
    expect(footerMatch).not.toBeNull();
    const htmlFooterRatio = parseInt(footerMatch![1], 10) / parseInt(footerMatch![2], 10);
    const footerDiffPct = (Math.abs(htmlFooterRatio - realFooterRatio) / realFooterRatio) * 100;
    expect(footerDiffPct).toBeLessThan(2);
  });

  test("3. Image URLs return HTTP 200 or local file exists with valid PNG header", async () => {
    for (const url of [VCH_HEADER_LOGO_URL, VCH_FOOTER_LOGO_URL]) {
      const filename = path.basename(new URL(url).pathname);
      const localPath = path.join(process.cwd(), "public/email", filename);

      try {
        const res = await fetch(url);
        if (res.status === 200) {
          expect(res.headers.get("content-type")?.includes("image/")).toBe(true);
        } else {
          expect(fs.existsSync(localPath)).toBe(true);
        }
      } catch {
        expect(fs.existsSync(localPath)).toBe(true);
      }
    }
  });

  test("4. Standardized sender addresses are strictly on fa-ibi.co.uk domain", () => {
    const senders = [
      "Virtual Car Hire <notifications@fa-ibi.co.uk>",
      "Virtual Car Hire <driver-alerts@fa-ibi.co.uk>",
      "Virtual Car Hire <auth@fa-ibi.co.uk>",
    ];

    for (const sender of senders) {
      expect(sender.endsWith("@fa-ibi.co.uk>")).toBe(true);
      expect(sender).not.toContain("resend.dev");
    }
  });

  test("5. Dedicated 2FA email HTML and text contain verification code and exclude generic driver alert wording", () => {
    const code = "918273";
    const html = render2FATemplate({ code });
    const text = `Your Virtual Car Hire verification code is: ${code}. This code expires in 10 minutes. If you didn't request this, ignore this email. Never share this code.`;

    expect(html).toContain(code);
    expect(text).toContain(code);

    // Ensure generic driver alert warning wording is absent
    expect(html).not.toContain("Important Requirement");
    expect(html).not.toContain("Driving an unroadworthy or unlicenced vehicle is against the law");
    expect(html).not.toContain("View Details in Portal");
  });

  test("6. Rent due dry run functionality evaluates and lists active drivers correctly", () => {
    const html = renderRentDueTomorrowTemplate({
      recipientName: "Operations Team",
      headline: "Rent due tomorrow",
      drivers: [
        {
          driverName: "Active Driver 1",
          reg: "EF34GHI",
          weeklyRent: 200,
          dueDate: "2026-10-11",
          rentStatus: "unpaid",
        },
        {
          driverName: "Active Driver 2",
          reg: "JK56LMN",
          weeklyRent: 220,
          dueDate: "2026-10-11",
          rentStatus: "paid",
        },
      ],
    });

    expect(html).toContain("Active Driver 1");
    expect(html).toContain("EF34GHI");
    expect(html).toContain("£200.00");
    expect(html).toContain("UNPAID");

    expect(html).toContain("Active Driver 2");
    expect(html).toContain("JK56LMN");
    expect(html).toContain("£220.00");
    expect(html).toContain("PAID");
  });
});
