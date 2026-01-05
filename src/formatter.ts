import type { BurnEvent, BurnStats, Config } from "./types";

/**
 * Format a burn event for Telegram notification
 * Uses HTML formatting (Telegram's parse_mode: "HTML")
 */
export function formatBurnAlert(
  burn: BurnEvent,
  stats: BurnStats,
  config: Config
): string {
  const amount = parseFloat(burn.uniAmount);
  const formattedAmount = amount.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  const burnerShort = `${burn.burner.slice(0, 6)}...${burn.burner.slice(-4)}`;
  const etherscanTxUrl = `https://etherscan.io/tx/${burn.txHash}`;
  const etherscanAddressUrl = `https://etherscan.io/address/${burn.burner}`;

  const date = new Date(burn.timestamp * 1000);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const totalBurned = parseFloat(stats.totalBurned).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  const destinationEmoji = burn.destination === "firepit" ? "🏺" : "💀";
  const destinationLabel = burn.destination === "firepit" ? "Firepit" : "0xdead";

  return `🔥 <b>UNI BURN DETECTED</b> 🔥

<b>Amount:</b> ${formattedAmount} UNI
<b>Destination:</b> ${destinationEmoji} ${destinationLabel}
<b>Burner:</b> <a href="${etherscanAddressUrl}">${burnerShort}</a>
<b>Time:</b> ${formattedDate}

📊 <b>Running Total:</b> ${totalBurned} UNI (${stats.burnCount} burns)

🔗 <a href="${etherscanTxUrl}">View Transaction</a>
📈 <a href="${config.siteUrl}">Track TokenJar</a>`;
}

/**
 * Format a threshold approaching alert
 */
export function formatThresholdAlert(
  uniToThreshold: number,
  currentJarValueUsd: number,
  config: Config
): string {
  const formattedUni = uniToThreshold.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  const formattedUsd = currentJarValueUsd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

  return `🎯 <b>BURN THRESHOLD APPROACHING</b>

Only <b>${formattedUni} UNI</b> until next burn!
Current Jar Value: <b>${formattedUsd}</b>

📈 <a href="${config.siteUrl}">Track Progress</a>`;
}

/**
 * Format a startup/test message
 */
export function formatStartupMessage(config: Config): string {
  return `🤖 <b>UNI Burn Bot Online</b>

Monitoring UNI token burns to Firepit and 0xdead addresses.
Alerts will be posted here when burns are detected.

📈 <a href="${config.siteUrl}">View TokenJar Dashboard</a>`;
}

/**
 * Format an error message (for admin notifications if needed)
 */
export function formatErrorMessage(error: string): string {
  return `⚠️ <b>Bot Error</b>

${error}

The bot will continue attempting to monitor burns.`;
}
