import { describe, expect, test } from "bun:test";
import { type AuditLogEntry, type AuditActionType } from "@/lib/audit-logger";

describe("Audit Logging & Event Formatting", () => {
  test("categorizes audit log actions correctly", () => {
    const isDriverAction = (type: AuditActionType) => type.startsWith("driver");
    const isVehicleAction = (type: AuditActionType) => type.startsWith("vehicle");

    expect(isDriverAction("driver_created")).toBe(true);
    expect(isDriverAction("driver_edited")).toBe(true);
    expect(isDriverAction("driver_deleted")).toBe(true);
    expect(isDriverAction("vehicle_added")).toBe(false);

    expect(isVehicleAction("vehicle_added")).toBe(true);
    expect(isVehicleAction("vehicle_edited")).toBe(true);
    expect(isVehicleAction("vehicle_deleted")).toBe(true);
    expect(isVehicleAction("rent_updated")).toBe(false);
  });

  test("filters log entries by keyword search across actor, target, and details", () => {
    const sampleLogs: AuditLogEntry[] = [
      {
        id: "1",
        actor: "admin@virtualcarhire.com",
        action_type: "driver_created",
        target_table: "driver_tracks",
        target_id: "d1",
        details: { driver_name: "John Doe", reg: "AB12 CDE", weekly_rent: 200 },
        created_at: new Date().toISOString(),
      },
      {
        id: "2",
        actor: "support@virtualcarhire.com",
        action_type: "rent_updated",
        target_table: "driver_tracks",
        target_id: "d2",
        details: { driver_name: "Jane Smith", reg: "XY55 ZZZ", previous_status: "unpaid", new_status: "paid" },
        created_at: new Date().toISOString(),
      },
      {
        id: "3",
        actor: "admin@virtualcarhire.com",
        action_type: "charge_added",
        target_table: "driver_charges",
        target_id: "d1",
        details: { driver_name: "John Doe", amount: 50, description: "PCO Inspection Fee" },
        created_at: new Date().toISOString(),
      },
    ];

    const filterLogs = (query: string, category: string) => {
      return sampleLogs.filter((log) => {
        if (category !== "all") {
          if (category === "driver" && !log.action_type.startsWith("driver")) return false;
          if (category === "rent" && log.action_type !== "rent_updated") return false;
          if (category === "charge" && log.action_type !== "charge_added") return false;
        }

        if (query) {
          const q = query.toLowerCase();
          const actorMatch = log.actor?.toLowerCase().includes(q);
          const actionMatch = log.action_type?.toLowerCase().includes(q);
          const targetMatch = log.target_id?.toLowerCase().includes(q);
          const detailsStr = JSON.stringify(log.details || {}).toLowerCase();
          const detailsMatch = detailsStr.includes(q);
          return actorMatch || actionMatch || targetMatch || detailsMatch;
        }

        return true;
      });
    };

    expect(filterLogs("John", "all")).toHaveLength(2);
    expect(filterLogs("Jane", "all")).toHaveLength(1);
    expect(filterLogs("PCO", "charge")).toHaveLength(1);
    expect(filterLogs("", "rent")).toHaveLength(1);
  });

  test("formats details for rent status updates cleanly", () => {
    const details = {
      driver_name: "Sarah Jenkins",
      reg: "LK68 XYZ",
      previous_status: "unpaid",
      new_status: "paid",
      weekly_rent: 220,
    };

    const items: string[] = [];
    if (details.driver_name) items.push(`Driver: ${details.driver_name}`);
    if (details.reg) items.push(`Reg: ${details.reg.toUpperCase()}`);
    if (details.previous_status && details.new_status) {
      items.push(`Rent: ${details.previous_status.toUpperCase()} ➔ ${details.new_status.toUpperCase()}`);
    }

    const formatted = items.join(" · ");
    expect(formatted).toBe("Driver: Sarah Jenkins · Reg: LK68 XYZ · Rent: UNPAID ➔ PAID");
  });
});
