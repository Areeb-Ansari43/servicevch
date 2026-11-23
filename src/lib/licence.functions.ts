import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveStaffEmail } from "@/lib/email-admin.functions";

/** Staff-only: read name, expiry date and licence number from a driving licence photo/PDF. */
export const readDrivingLicenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        // data:<mime>;base64,... (about 9 MB of file at most)
        file: z.string().startsWith("data:").max(12_500_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await resolveStaffEmail(context as Parameters<typeof resolveStaffEmail>[0]);
    const { readDrivingLicence } = await import("@/lib/licence-reader.server");
    return readDrivingLicence(data.file);
  });
