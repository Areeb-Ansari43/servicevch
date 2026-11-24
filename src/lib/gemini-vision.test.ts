import { afterEach, describe, expect, test } from "bun:test";
import { canSkipThinking, geminiImageJson, modelsToTry } from "./gemini-vision.server";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_API_KEY;
});

const ok = (obj: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });

describe("gemini vision helper", () => {
  test("thinking is only switched off on 2.5 Flash models", () => {
    expect(canSkipThinking("gemini-2.5-flash")).toBe(true);
    expect(canSkipThinking("gemini-2.5-flash-lite")).toBe(true);
    expect(canSkipThinking("gemini-2.5-pro")).toBe(false);
    expect(canSkipThinking("gemini-3-pro-preview")).toBe(false);
  });

  test("configured model goes first, no duplicates", () => {
    process.env.GEMINI_MODEL = "gemini-2.5-pro";
    const m = modelsToTry();
    expect(m[0]).toBe("gemini-2.5-pro");
    expect(new Set(m).size).toBe(m.length);
  });

  test("retries the same model without thinking setting when it is rejected", async () => {
    process.env.GEMINI_API_KEY = "test";
    const bodies: any[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      if (body.generationConfig.thinkingConfig)
        return new Response('{"error":{"message":"thinking budget is not supported"}}', { status: 400 });
      return ok({ a: 1 });
    }) as any;
    const r = await geminiImageJson({ prompt: "p", mimeType: "image/jpeg", base64: "x" });
    expect(r.ok).toBe(true);
    expect(bodies.length).toBe(2);
  });

  test("moves to the next model on 404 and reports the reason when all fail", async () => {
    process.env.GEMINI_API_KEY = "test";
    globalThis.fetch = (async () => new Response("not found", { status: 404 })) as any;
    const r = await geminiImageJson({ prompt: "p", mimeType: "image/jpeg", base64: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("http_404");
  });

  test("missing key is reported without calling the API", async () => {
    let called = false;
    globalThis.fetch = (async () => ((called = true), ok({}))) as any;
    const r = await geminiImageJson({ prompt: "p", mimeType: "image/jpeg", base64: "x" });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
});
