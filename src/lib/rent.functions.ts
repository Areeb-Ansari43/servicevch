import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveStaffEmail } from "@/lib/email-admin.functions";

/** Staff-only weekly rent actions used by the Drivers page and the driver profile. */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Paid / Unpaid button (and "Mark paid" on a missed week in the history). */
export const recordRentPaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        driverId: z.string().min(1),
        action: z.enum(["paid", "unpaid"]),
        dueDate: ymd.optional(),
        keepBalance: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const staffEmail = await resolveStaffEmail(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordRentAction } = await import("@/lib/rent-cycle.server");
    return recordRentAction(supabaseAdmin, data.driverId, data.action, {
      dueDate: data.dueDate ?? null,
      recordedBy: staffEmail,
      keepBalance: data.keepBalance === true,
    });
  });

/** Rolls all drivers forward to the current rent week (auto Unpaid + missed-week log). */
export const syncRentCyclesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveStaffEmail(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { syncRentCycles } = await import("@/lib/rent-cycle.server");
    return syncRentCycles(supabaseAdmin);
  });

export const getRentHistoryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driverId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await resolveStaffEmail(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRentHistory } = await import("@/lib/rent-cycle.server");
    return getRentHistory(supabaseAdmin, data.driverId);
  });
