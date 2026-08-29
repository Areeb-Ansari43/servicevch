/**
 * Telegram alerting. Degrades gracefully (no throw) when the bot token or chat id
 * are missing so the rest of the flow keeps working until keys are supplied.
 */
export async function sendTelegramAlert(text: string): Promise<{ sent: boolean; reason?: string }> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  const chatId = process.env["TELEGRAM_CHAT_ID"];
  if (!token || !chatId) {
    console.warn(
      "[Telegram] Skipped alert — TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured.",
    );
    return { sent: false, reason: "not_configured" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.warn(`[Telegram] sendMessage failed: ${res.status}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[Telegram] sendMessage error", err);
    return { sent: false, reason: "network_error" };
  }
}
