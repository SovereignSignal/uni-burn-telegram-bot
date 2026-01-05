import TelegramBot from "node-telegram-bot-api";
import type { Config } from "./types";

let bot: TelegramBot | null = null;

export function initTelegramBot(config: Config): TelegramBot {
  if (bot) return bot;

  bot = new TelegramBot(config.telegramBotToken, { polling: false });
  console.log("[Telegram] Bot initialized");
  return bot;
}

export function getTelegramBot(): TelegramBot {
  if (!bot) {
    throw new Error("Telegram bot not initialized. Call initTelegramBot first.");
  }
  return bot;
}

export async function sendMessage(
  channelId: string,
  message: string,
  options?: TelegramBot.SendMessageOptions
): Promise<TelegramBot.Message> {
  const bot = getTelegramBot();

  try {
    const result = await bot.sendMessage(channelId, message, {
      parse_mode: "HTML",
      disable_web_page_preview: false,
      ...options,
    });
    console.log(`[Telegram] Message sent to ${channelId}`);
    return result;
  } catch (error) {
    console.error("[Telegram] Failed to send message:", error);
    throw error;
  }
}

export async function sendBurnAlert(
  channelId: string,
  message: string
): Promise<TelegramBot.Message> {
  return sendMessage(channelId, message, {
    disable_web_page_preview: true,
  });
}

export async function testConnection(channelId: string): Promise<boolean> {
  try {
    const bot = getTelegramBot();
    const me = await bot.getMe();
    console.log(`[Telegram] Connected as @${me.username}`);

    // Try to get chat info to verify channel access
    const chat = await bot.getChat(channelId);
    console.log(`[Telegram] Channel verified: ${chat.title || channelId}`);

    return true;
  } catch (error) {
    console.error("[Telegram] Connection test failed:", error);
    return false;
  }
}
