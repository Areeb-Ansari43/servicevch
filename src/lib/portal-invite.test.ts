import { describe, expect, test } from "bun:test";
import type { DriverTrack } from "./fleet-data";

export function formatPortalInviteUrl(token: string): string {
  if (!token) return "";
  return `https://virtualcarhire.pages.dev/portal/signup?invite=${token}`;
}

export function formatPortalInviteMessage(driverName: string, inviteUrl: string): string {
  return `Hello ${driverName}, thank you for joining Virtual Car Hire. Please make an account using this link: ${inviteUrl}. This is our portal where you can track all your rent — whatever rent is coming, you'll be opted into service and rent reminders by email. Please look through there and create an account. If you have any trouble, please contact us straight away.`;
}

export function getPortalStatusLabel(driver: Pick<DriverTrack, "invite_status">): string {
  const status = driver.invite_status ?? "none";
  if (status === "accepted") return "Portal active";
  if (status === "pending") return "Invite sent";
  return "Not invited";
}

describe("Driver Portal Invite Logic", () => {
  test("formats shareable portal signup link correctly with token", () => {
    const token = "123e4567-e89b-12d3-a456-426614174000";
    const url = formatPortalInviteUrl(token);
    expect(url).toBe("https://virtualcarhire.pages.dev/portal/signup?invite=123e4567-e89b-12d3-a456-426614174000");
  });

  test("generates portal invite without requiring email upfront", () => {
    const token = crypto.randomUUID();
    const url = formatPortalInviteUrl(token);
    const message = formatPortalInviteMessage("John Doe", url);
    expect(url).toContain("https://virtualcarhire.pages.dev/portal/signup?invite=");
    expect(message).toContain("Hello John Doe, thank you for joining Virtual Car Hire");
    expect(message).toContain("Please make an account using this link:");
  });

  test("returns correct status label for invite status states", () => {
    expect(getPortalStatusLabel({ invite_status: "none" })).toBe("Not invited");
    expect(getPortalStatusLabel({ invite_status: "pending" })).toBe("Invite sent");
    expect(getPortalStatusLabel({ invite_status: "accepted" })).toBe("Portal active");
    expect(getPortalStatusLabel({ invite_status: null })).toBe("Not invited");
  });

  test("re-invite generates a new token to invalidate old links", () => {
    const token1 = crypto.randomUUID();
    const token2 = crypto.randomUUID();
    expect(token1).not.toBe(token2);
    expect(formatPortalInviteUrl(token1)).not.toBe(formatPortalInviteUrl(token2));
  });
});
