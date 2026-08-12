/**
 * Central config for the third-party integrations (Vapi voice, WhatsApp Business,
 * Telegram alerts). All values come from environment variables and every consumer
 * must degrade gracefully — with a console warning — when a key is missing, since
 * real credentials are supplied later.
 *
 * Browser-visible (safe, publishable) values use the VITE_ prefix.
 * Server-only secrets are read inside server handlers via process.env.
 */

const readClientEnv = (key: string): string =>
  ((import.meta as unknown as { env?: Record<string, string> }).env?.[key] ?? "").trim();

export const vapiConfig = {
  /** Vapi public/web key — safe to expose to the browser. */
  publicKey: readClientEnv("VITE_VAPI_API_KEY"),
  assistantId: readClientEnv("VITE_VAPI_ASSISTANT_ID"),
};

export const isVapiConfigured = () => Boolean(vapiConfig.publicKey && vapiConfig.assistantId);

let warned = false;
export function warnVapiMissing() {
  if (warned) return;
  warned = true;
  console.warn(
    "[Vapi] Voice assistant disabled — set VITE_VAPI_API_KEY and VITE_VAPI_ASSISTANT_ID to enable 'Talk to Apex'.",
  );
}

/** Server-side integration names, read inside handlers (never at module scope). */
export const SERVER_INTEGRATION_ENV = {
  vapiPrivateKey: "VAPI_API_KEY",
  vapiAssistantId: "VAPI_ASSISTANT_ID",
  whatsappToken: "WHATSAPP_BUSINESS_API_TOKEN",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramChatId: "TELEGRAM_CHAT_ID",
} as const;
