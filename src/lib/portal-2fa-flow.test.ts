import { describe, test, expect } from "bun:test";
import { VCH_LOGO_URL, HERO_IMAGE_URL, render2FATemplate } from "@/lib/email-templates";
import { hashEmailForAudit } from "@/lib/portal-auth-logger";

describe("2FA Full Flow & Image Assets Verification", () => {
  test("Live HTTP fetch on public email image URLs returns 200 OK with valid image content-type", async () => {
    // 1. Fetch Brand Logo Image URL
    const logoRes = await fetch(VCH_LOGO_URL);
    expect(logoRes.status).toBe(200);
    const logoContentType = logoRes.headers.get("content-type") || "";
    expect(logoContentType.includes("image/png")).toBe(true);

    // 2. Fetch Hero Banner Image URL
    const heroRes = await fetch(HERO_IMAGE_URL);
    expect(heroRes.status).toBe(200);
    const heroContentType = heroRes.headers.get("content-type") || "";
    expect(heroContentType.includes("image/jpeg")).toBe(true);
  });

  test("render2FATemplate displays 6-digit code in top block under headline with fallback dimensions & alt text", () => {
    const html = render2FATemplate({
      code: "739102",
      recipientName: "Areeb",
      expiresInMinutes: 10,
    });

    // Check code placement & styling
    expect(html).toContain("YOUR 6-DIGIT VERIFICATION CODE");
    expect(html).toContain("739102");
    expect(html).toContain("Code expires in");
    expect(html).toContain("10 minutes");

    // Check image attributes: width, height, alt, background-color fallback
    expect(html).toContain(`src="${VCH_LOGO_URL}"`);
    expect(html).toContain('alt="Virtual Car Hire"');
    expect(html).toContain('width="180"');
    expect(html).toContain('height="48"');
    expect(html).toContain("background-color: #0B0E17");

    expect(html).toContain(`src="${HERO_IMAGE_URL}"`);
    expect(html).toContain('alt="Virtual Car Hire Fleet"');
    expect(html).toContain('width="600"');
    expect(html).toContain('height="200"');
    expect(html).toContain("background-color: #1E293B");
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
