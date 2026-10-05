import { describe, expect, test } from "bun:test";
import {
  detectSecondaryProvider,
  sanitizeErrorMessage,
  isCircuitOpen,
  recordFailure,
  recordSuccess,
} from "./ai-providers";

describe("AI Providers Key Detection & Circuit Breaker", () => {
  test("sanitizes API keys in error messages", () => {
    const rawError = "Error calling https://generativelanguage.googleapis.com?key=AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6";
    const sanitized = sanitizeErrorMessage(rawError);
    expect(sanitized).not.toContain("AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6");
    expect(sanitized).toContain("AIzaSy***");
  });

  test("sanitizes Groq and xAI keys in error messages", () => {
    const groqErr = "Failed with key gsk_1234567890abcdef1234567890abcdef";
    expect(sanitizeErrorMessage(groqErr)).toContain("gsk_***");

    const grokErr = "Failed with key xai-1234567890abcdef1234567890abcdef";
    expect(sanitizeErrorMessage(grokErr)).toContain("xai-***");
  });

  test("circuit breaker opens after 2 failures and resets on success", () => {
    const provider = "test_provider_" + Date.now();
    expect(isCircuitOpen(provider)).toBe(false);

    recordFailure(provider);
    expect(isCircuitOpen(provider)).toBe(false);

    recordFailure(provider);
    expect(isCircuitOpen(provider)).toBe(true);

    recordSuccess(provider);
    expect(isCircuitOpen(provider)).toBe(false);
  });
});
