import { afterEach, describe, expect, it } from "bun:test";
import { PORTAL_ENABLED, portalApiEnabled } from "./features";
import { handleRequestCode } from "@/routes/api/public/portal-auth/request-code";

describe("driver portal switched off", () => {
  const saved = process.env.PORTAL_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.PORTAL_ENABLED;
    else process.env.PORTAL_ENABLED = saved;
  });

  it("is off by default and the login endpoint says so", async () => {
    delete process.env.PORTAL_ENABLED;
    expect(PORTAL_ENABLED).toBe(false);
    expect(portalApiEnabled()).toBe(false);
    const res = await handleRequestCode(
      new Request("https://hq.test/api/public/portal-auth/request-code", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "portal_disabled" });
  });

  it("can be switched back on with PORTAL_ENABLED=true", () => {
    process.env.PORTAL_ENABLED = "true";
    expect(portalApiEnabled()).toBe(true);
  });
});
