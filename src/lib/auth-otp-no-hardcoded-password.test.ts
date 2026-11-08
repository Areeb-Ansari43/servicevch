import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";

// Guards against re-introducing a hard-coded login bypass in the CRM auth flow.
// The CRM admin must authenticate through Supabase Auth like every other account.
const source = fs.readFileSync(path.join(process.cwd(), "src/lib/auth-otp.functions.ts"), "utf8");

// Any string-literal constant whose name looks like a credential, e.g.
//   const ALLOWED_PASSWORD = "...";   let adminPass = '...';   const STAFF_SECRET = `...`;
const CREDENTIAL_CONST =
  /\b(?:const|let|var)\s+(\w*(?:pass(?:word|wd)?|pwd|secret)\w*)\s*(?::\s*\w+\s*)?=\s*(["'`])/gi;

// A direct comparison of the submitted password against a literal, e.g. password === "...".
const PASSWORD_LITERAL_COMPARE = /\bpassword\s*[!=]==?\s*["'`]|["'`]\s*[!=]==?\s*password\b/i;

describe("auth-otp.functions.ts has no hard-coded credentials", () => {
  test("no string-literal password/secret constants", () => {
    const names = [...source.matchAll(CREDENTIAL_CONST)].map((m) => m[1]);
    expect(names).toEqual([]);
  });

  test("submitted password is never compared to a literal", () => {
    expect(PASSWORD_LITERAL_COMPARE.test(source)).toBe(false);
  });

  test("password check goes through Supabase Auth on a throwaway client", () => {
    expect(source).toContain("createEphemeralAuthClient().auth.signInWithPassword");
    expect(source).not.toMatch(/supabaseAdmin\.auth\.signInWithPassword/);
  });

  test("detector catches the pattern it guards against", () => {
    const bad = 'const ALLOWED_PASSWORD = "example";\nif (password === "example") {}';
    expect([...bad.matchAll(CREDENTIAL_CONST)].length).toBe(1);
    expect(PASSWORD_LITERAL_COMPARE.test(bad)).toBe(true);
  });
});
