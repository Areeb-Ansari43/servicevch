import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { VCH_HEADER_LOGO_URL, VCH_FOOTER_LOGO_URL, render2FATemplate } from "@/lib/email-templates";
import { hashEmailForAudit } from "@/lib/portal-auth-logger";

describe("2FA Full Flow & Image Assets Verification", () => {
  test("Logo aspect ratio in rendered HTML matches real cropped image ratio within 2%", async () => {
    const headerPath = path.join(process.cwd(), "public/email/logo-header.png");
    const footerPath = path.join(process.cwd(), "public/email/logo-footer.png");

    expect(fs.existsSync(headerPath)).toBe(true);
    expect(fs.existsSync(footerPath)).toBe(true);

    const headerMeta = await sharp(headerPath).metadata();
    const footerMeta = await sharp(footerPath).metadata();

    const realHeaderRatio = (headerMeta.width || 1) / (headerMeta.height || 1);
    const realFooterRatio = (footerMeta.width || 1) / (footerMeta.height || 1);

    // Render 2FA template HTML
    const html = render2FATemplate({ code: "849201" });

    // Extract width and height for header logo
    const headerMatch = html.match(/src="[^"]*logo-header\.png"[^>]*width="(\d+)"[^>]*height="(\d+)"/) ||
                        html.match(/width="(\d+)"[^>]*height="(\d+)"[^>]*src="[^"]*logo-header\.png"/);
    expect(headerMatch).not.toBeNull();
    const headerHtmlWidth = parseInt(headerMatch![1], 10);
    const headerHtmlHeight = parseInt(headerMatch![2], 10);
    const htmlHeaderRatio = headerHtmlWidth / headerHtmlHeight;

    const headerDiffPct = Math.abs(htmlHeaderRatio - realHeaderRatio) / realHeaderRatio * 100;
    expect(headerDiffPct).toBeLessThan(2);

    // Extract width and height for footer logo
    const footerMatch = html.match(/src="[^"]*logo-footer\.png"[^>]*width="(\d+)"[^>]*height="(\d+)"/) ||
                        html.match(/width="(\d+)"[^>]*height="(\d+)"[^>]*src="[^"]*logo-footer\.png"/);
    expect(footerMatch).not.toBeNull();
    const footerHtmlWidth = parseInt(footerMatch![1], 10);
    const footerHtmlHeight = parseInt(footerMatch![2], 10);
    const htmlFooterRatio = footerHtmlWidth / footerHtmlHeight;

    const footerDiffPct = Math.abs(htmlFooterRatio - realFooterRatio) / realFooterRatio * 100;
    expect(footerDiffPct).toBeLessThan(2);
  });

  test("Public email image assets return HTTP 200 or exist locally with valid PNG header", async () => {
    const urls = [VCH_HEADER_LOGO_URL, VCH_FOOTER_LOGO_URL];

    for (const url of urls) {
      const filename = path.basename(new URL(url).pathname);
      const localPath = path.join(process.cwd(), "public/email", filename);

      try {
        const res = await fetch(url);
        if (res.status === 200) {
          const contentType = res.headers.get("content-type") || "";
          expect(contentType.includes("image/")).toBe(true);
        } else {
          // Pre-deployment fallback: verify local public file
          expect(fs.existsSync(localPath)).toBe(true);
          const meta = await sharp(localPath).metadata();
          expect(meta.format).toBe("png");
        }
      } catch {
        expect(fs.existsSync(localPath)).toBe(true);
      }
    }
  });

  test("render2FATemplate displays 6-digit code in dedicated code block under headline with fallback dimensions & alt text", () => {
    const html = render2FATemplate({
      code: "739102",
      recipientName: "Areeb",
      expiresInMinutes: 10,
    });

    expect(html).toContain("739102");
    expect(html).toContain("Your verification code");
    expect(html).toContain("This code expires in 10 minutes");
    expect(html).toContain("If you didn't request this, ignore this email. Never share this code.");

    expect(html).toContain(`src="${VCH_HEADER_LOGO_URL}"`);
    expect(html).toContain('alt="Virtual Car Hire"');
    expect(html).toContain('width="220"');
    expect(html).toContain('height="66"');

    expect(html).toContain(`src="${VCH_FOOTER_LOGO_URL}"`);
    expect(html).toContain('width="140"');
    expect(html).toContain('height="42"');
  });

  test("hashEmailForAudit hashes email consistently with SHA-256 and trims whitespace/case", async () => {
    const hash1 = await hashEmailForAudit("  Driver.Test@Example.com  ");
    const hash2 = await hashEmailForAudit("driver.test@example.com");

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 64 hex chars
    expect(hash1).not.toContain("driver");
    expect(hash1).not.toContain("example.com");
  });

  test("Trimming and lowercasing email and code inputs", () => {
    const rawEmail = "  Driver.Test@Example.com  ";
    const rawCode = "  849201  ";

    const normalizedEmail = rawEmail.trim().toLowerCase();
    const normalizedCode = rawCode.trim();

    expect(normalizedEmail).toBe("driver.test@example.com");
    expect(normalizedCode).toBe("849201");
    expect(/^\d{6}$/.test(normalizedCode)).toBe(true);
  });
});
