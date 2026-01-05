import TelegramBot from "node-telegram-bot-api";
import type { Config, ExtendedBurnStats } from "./types";

let bot: TelegramBot | null = null;
let statsCallback: (() => ExtendedBurnStats) | null = null;
let configRef: Config | null = null;

export function initTelegramBot(config: Config): TelegramBot {
  if (bot) return bot;

  // Enable polling to receive commands
  bot = new TelegramBot(config.telegramBotToken, { polling: true });
  configRef = config;
  console.log("[Telegram] Bot initialized with polling enabled");
  return bot;
}

export function registerStatsCommand(getStats: () => ExtendedBurnStats): void {
  if (!bot) {
    throw new Error("Telegram bot not initialized");
  }

  statsCallback = getStats;

  bot.onText(/\/stats/, async (msg) => {
    if (!statsCallback || !configRef) return;

    const chatId = msg.chat.id;
    const stats = statsCallback();

    const message = formatStatsMessage(stats, configRef);
    await sendMessage(chatId.toString(), message, { disable_web_page_preview: true });
  });

  bot.onText(/\/test/, async (msg) => {
    if (!statsCallback || !configRef) return;

    const chatId = msg.chat.id;
    const stats = statsCallback();

    // Send a mock burn alert to preview the format
    const mockMessage = formatMockBurnAlert(stats, configRef);
    await sendMessage(chatId.toString(), mockMessage, { disable_web_page_preview: true });
  });

  console.log("[Telegram] Command handlers registered: /stats, /test");
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

function formatStatsMessage(stats: ExtendedBurnStats, config: Config): string {
  const totalUni = parseFloat(stats.totalBurned).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  const avgTimeBetween = stats.averageTimeBetweenSeconds
    ? formatDuration(stats.averageTimeBetweenSeconds)
    : "N/A";

  const timeSinceLast = stats.lastBurnTimestamp
    ? formatDuration(Math.floor(Date.now() / 1000) - stats.lastBurnTimestamp)
    : "N/A";

  const medals = ["🥇", "🥈", "🥉"];
  const topSearchersText = stats.topInitiators.length > 0
    ? stats.topInitiators
        .map((searcher, index) => {
          const addrShort = `${searcher.address.slice(0, 10)}...`;
          const addrUrl = `https://etherscan.io/address/${searcher.address}`;
          return `${medals[index]} <a href="${addrUrl}">${addrShort}</a> - ${searcher.transactionCount} burns`;
        })
        .join("\n")
    : "No burns recorded yet";

  return `📊 <b>UNI Burn Statistics</b>

<b>Total UNI Burned:</b> ${totalUni} UNI
<b>Total Burns:</b> ${stats.burnCount}
<b>Average Time Between:</b> ${avgTimeBetween}
<b>Unique Searchers:</b> ${stats.uniqueInitiatorCount}
<b>Time Since Last Burn:</b> ${timeSinceLast}

<b>Top Searchers:</b>
${topSearchersText}

📈 <a href="${config.siteUrl}">TokenJar Dashboard</a>`;
}

function formatMockBurnAlert(stats: ExtendedBurnStats, config: Config): string {
  const totalUni = parseFloat(stats.totalBurned).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  const avgTimeBetween = stats.averageTimeBetweenSeconds
    ? formatDuration(stats.averageTimeBetweenSeconds)
    : "N/A";

  const timeSinceLast = stats.lastBurnTimestamp
    ? formatDuration(Math.floor(Date.now() / 1000) - stats.lastBurnTimestamp)
    : "N/A";

  const medals = ["🥇", "🥈", "🥉"];
  const topSearchersText = stats.topInitiators.length > 0
    ? stats.topInitiators
        .map((searcher, index) => {
          const addrShort = `${searcher.address.slice(0, 10)}...`;
          const addrUrl = `https://etherscan.io/address/${searcher.address}`;
          return `${medals[index]} <a href="${addrUrl}">${addrShort}</a> - ${searcher.transactionCount} burns`;
        })
        .join("\n")
    : "No burns recorded yet";

  return `🧪 <b>TEST: UNI Burn Detected</b>

📁 <b>Latest Burn</b>
<b>Searcher:</b> <a href="https://etherscan.io/address/0x0000000000000000000000000000000000000000">0x0000...0000</a>
<b>Transaction:</b> <a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000000000">0x00000000...</a>
<b>Amount:</b> 4,000 UNI

<b>Time Since Last Burn:</b> ${timeSinceLast}

📊 <b>Aggregate Statistics</b>
<b>Total UNI Burned:</b> ${totalUni} UNI
<b>Total Burns:</b> ${stats.burnCount}
<b>Average Time Between:</b> ${avgTimeBetween}
<b>Unique Searchers:</b> ${stats.uniqueInitiatorCount}

<b>Top Searchers:</b>
${topSearchersText}

💎 <a href="https://etherscan.io/tx/0x0000000000000000000000000000000000000000000000000000000000000000">View on Etherscan</a>
📈 <a href="${config.siteUrl}">TokenJar Dashboard</a>`;
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
