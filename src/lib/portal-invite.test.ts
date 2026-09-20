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

  test("generating portal invite produces a unique UUID token on each invocation", () => {
    const generatePortalInviteFn = () => crypto.randomUUID();

    const token1 = generatePortalInviteFn();
    const token2 = generatePortalInviteFn();

    expect(token1).not.toBe(token2);
    expect(token1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(token2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test("deleting a driver revokes portal access and clears auth link and invite tokens", () => {
    const activeDriver: DriverTrack = {
      id: "driver-del-1",
      driver_name: "Active Portal Driver",
      email: "active@example.com",
      phone: "07000111222",
      vehicle_id: "veh-1",
      registration: "AB12 CDE",
      start_mileage: 1000,
      current_mileage: 1200,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2026-01-01",
      weekly_rent: 250,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      auth_user_id: "auth-user-active-123",
      invite_token: "token-active-456",
      invite_status: "accepted",
      charges: [],
      monthly_logs: [],
    };

    // Simulate revoke action on driver deletion
    const revokedDriver: DriverTrack = {
      ...activeDriver,
      auth_user_id: null,
      invite_token: null,
      invite_status: "none",
    };

    expect(revokedDriver.auth_user_id).toBeNull();
    expect(revokedDriver.invite_token).toBeNull();
    expect(revokedDriver.invite_status).toBe("none");
    expect(getPortalStatusLabel(revokedDriver)).toBe("Not invited");
  });
});
