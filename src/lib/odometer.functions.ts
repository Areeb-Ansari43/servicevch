import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveStaffEmail } from "@/lib/email-admin.functions";

/** Staff-only odometer photo reader for the CRM (same reader as the driver portal). */
export const scanOdometerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        // data:<mime>;base64,... (photos are shrunk in the browser first) or an https URL
        image: z.string().min(10).max(12_500_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await resolveStaffEmail(context as Parameters<typeof resolveStaffEmail>[0]);
    const { parseOdometerPhoto } = await import("@/routes/api/public/ocr-odometer");
    return parseOdometerPhoto(data.image);
  });
