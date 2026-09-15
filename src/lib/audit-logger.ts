import { supabase } from "@/integrations/supabase/client";

export type AuditActionType =
  | "driver_created"
  | "driver_edited"
  | "driver_deleted"
  | "rent_updated"
  | "charge_added"
  | "invite_sent"
  | "vehicle_added"
  | "vehicle_edited"
  | "vehicle_deleted";

export type AuditLogEntry = {
  id: string;
  actor: string;
  action_type: string;
  target_table: string;
  target_id: string | null;
  details: Record<string, any> | null;
  created_at: string;
};

export async function logAuditEvent({
  actionType,
  targetTable,
  targetId,
  details,
  actor,
}: {
  actionType: AuditActionType;
  targetTable: string;
  targetId?: string | null;
  details?: Record<string, any> | null;
  actor?: string | null;
}): Promise<void> {
  try {
    let actorEmail = actor;
    if (!actorEmail) {
      if (typeof window !== "undefined" && (window as any).__MOCK_AUTH__) {
        actorEmail = "admin@virtualcarhire.com";
      } else {
        const { data: sessionData } = await supabase.auth.getSession();
        actorEmail = sessionData?.session?.user?.email ?? "Fleet Admin";
      }
    }

    const payload = {
      actor: actorEmail || "Fleet Admin",
      action_type: actionType,
      target_table: targetTable,
      target_id: targetId ?? null,
      details: details ?? {},
    };

    const { error } = await supabase.from("audit_logs").insert(payload);
    if (error) {
      console.error("[AuditLog] Error recording audit event:", error.message);
    }
  } catch (err) {
    console.error("[AuditLog] Exception recording audit event:", err);
  }
}
