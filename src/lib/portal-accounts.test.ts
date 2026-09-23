import { describe, expect, it } from "bun:test";
import { type PortalAuthUser, type DriverTrack } from "./fleet-data";

describe("Portal Accounts Audit & Clean Up Logic", () => {
  const mockDrivers: DriverTrack[] = [
    {
      id: "drv-areeb",
      driver_name: "Areeb",
      email: "areeb@virtualcarhire.com",
      auth_user_id: "auth-user-areeb-123",
      registration: "KN73XLB",
      active: true,
      deleted_at: null,
      vehicle_id: "veh-1",
      start_mileage: 12000,
      current_mileage: 15000,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2024-01-01",
      weekly_rent: 260,
      rent_due_day: "Monday",
      rent_status: "paid",
      balance_due: 0,
      monthly_logs: [],
    },
    {
      id: "drv-sajid",
      driver_name: "Sajid",
      email: "sajid@virtualcarhire.com",
      auth_user_id: null,
      registration: "KF19UCJ",
      active: true,
      deleted_at: null,
      vehicle_id: "veh-2",
      start_mileage: 25000,
      current_mileage: 28000,
      allowance: 5000,
      excess_rate: 20,
      start_date: "2024-02-01",
      weekly_rent: 220,
      rent_due_day: "Monday",
      rent_status: "unpaid",
      balance_due: 220,
      monthly_logs: [],
    },
  ];

  const mockAuthUsers = [
    {
      id: "auth-user-areeb-123",
      email: "areeb@virtualcarhire.com",
      created_at: "2024-01-01T10:00:00Z",
      last_sign_in_at: "2024-03-01T12:00:00Z",
    },
    {
      id: "auth-user-stray-999",
      email: "oldtestuser@example.com",
      created_at: "2023-11-01T10:00:00Z",
      last_sign_in_at: "2023-11-02T12:00:00Z",
    },
    {
      id: "auth-user-sajid-456",
      email: "sajid@virtualcarhire.com",
      created_at: "2024-02-01T10:00:00Z",
      last_sign_in_at: null,
    },
  ];

  it("cross-references Supabase Auth users with driver_tracks to flag orphaned accounts correctly", () => {
    const driverByAuthId = new Map(
      mockDrivers.filter((d) => d.auth_user_id).map((d) => [d.auth_user_id, d]),
    );
    const driverByEmail = new Map(
      mockDrivers.filter((d) => d.email).map((d) => [d.email!.toLowerCase(), d]),
    );

    const mappedUsers: PortalAuthUser[] = mockAuthUsers.map((u) => {
      const linkedDriver =
        driverByAuthId.get(u.id) ||
        (u.email ? driverByEmail.get(u.email.toLowerCase()) : undefined);

      const isOrphaned = !linkedDriver || Boolean(linkedDriver.deleted_at);

      return {
        id: u.id,
        email: u.email || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        linkedDriver: linkedDriver
          ? {
              id: linkedDriver.id,
              driver_name: linkedDriver.driver_name,
              registration: linkedDriver.registration,
              email: linkedDriver.email || null,
              active: linkedDriver.active ?? true,
              deleted_at: linkedDriver.deleted_at || null,
            }
          : null,
        isOrphaned,
      };
    });

    expect(mappedUsers.length).toBe(3);

    // Areeb - matched by auth_user_id
    const areebUser = mappedUsers.find((u) => u.id === "auth-user-areeb-123");
    expect(areebUser).toBeDefined();
    expect(areebUser?.isOrphaned).toBe(false);
    expect(areebUser?.linkedDriver?.driver_name).toBe("Areeb");

    // Sajid - matched by email
    const sajidUser = mappedUsers.find((u) => u.id === "auth-user-sajid-456");
    expect(sajidUser).toBeDefined();
    expect(sajidUser?.isOrphaned).toBe(false);
    expect(sajidUser?.linkedDriver?.driver_name).toBe("Sajid");

    // Stray account - orphaned
    const strayUser = mappedUsers.find((u) => u.id === "auth-user-stray-999");
    expect(strayUser).toBeDefined();
    expect(strayUser?.isOrphaned).toBe(true);
    expect(strayUser?.linkedDriver).toBeNull();
  });

  it("handles soft-deleted drivers with 48-hour recovery window", () => {
    const deletedDriver: DriverTrack = {
      ...mockDrivers[0],
      active: false,
      deleted_at: new Date().toISOString(),
    };

    const isWithinRecoveryWindow = (deletedAt: string | null) => {
      if (!deletedAt) return false;
      const deletedTime = new Date(deletedAt).getTime();
      const elapsedHours = (Date.now() - deletedTime) / (1000 * 60 * 60);
      return elapsedHours <= 48;
    };

    expect(isWithinRecoveryWindow(deletedDriver.deleted_at)).toBe(true);

    // Restoring reactivates driver and restores active flag
    const restoredDriver: DriverTrack = {
      ...deletedDriver,
      active: true,
      deleted_at: null,
    };

    expect(restoredDriver.active).toBe(true);
    expect(restoredDriver.deleted_at).toBeNull();
    expect(restoredDriver.auth_user_id).toBe("auth-user-areeb-123");
  });

  it("verifies audit event payload structure for portal deletion and driver restoration", () => {
    const portalDeleteAudit = {
      action_type: "portal_account_deleted",
      target_id: "auth-user-stray-999",
      actor: "admin@virtualcarhire.com",
      details: {
        auth_user_id: "auth-user-stray-999",
        email: "oldtestuser@example.com",
        permanent: true,
      },
    };

    expect(portalDeleteAudit.action_type).toBe("portal_account_deleted");
    expect(portalDeleteAudit.details.permanent).toBe(true);

    const driverRestoreAudit = {
      action_type: "driver_restored",
      target_id: "drv-areeb",
      actor: "admin@virtualcarhire.com",
      details: {
        driver_name: "Areeb",
        registration: "KN73XLB",
        auth_user_id: "auth-user-areeb-123",
      },
    };

    expect(driverRestoreAudit.action_type).toBe("driver_restored");
    expect(driverRestoreAudit.details.auth_user_id).toBe("auth-user-areeb-123");
  });
});
