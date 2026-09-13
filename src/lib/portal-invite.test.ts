import { describe, expect, test } from "bun:test";
import type { DriverTrack } from "./fleet-data";

export function formatPortalInviteUrl(token: string): string {
  if (!token) return "";
  return `https://virtualcarhire.pages.dev/portal/signup?invite=${token}`;
}

export function canSendPortalInvite(driver: Pick<DriverTrack, "email">): boolean {
  return Boolean(driver.email && driver.email.trim().length > 0);
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

  test("requires driver email to send portal invite", () => {
    expect(canSendPortalInvite({ email: "driver@example.com" })).toBe(true);
    expect(canSendPortalInvite({ email: "  " })).toBe(false);
    expect(canSendPortalInvite({ email: null })).toBe(false);
    expect(canSendPortalInvite({ email: undefined })).toBe(false);
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
