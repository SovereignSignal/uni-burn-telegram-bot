import type { BurnEvent, ExtendedBurnStats, Config } from "./types";

/**
 * Format seconds into a human-readable duration string
 */
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

/**
 * Format a burn event for Telegram notification
 * Uses HTML formatting (Telegram's parse_mode: "HTML")
 * Matches the Slack notification format
 */
export function formatBurnAlert(
  burn: BurnEvent,
  stats: ExtendedBurnStats,
  config: Config
): string {
  const burnerShort = `${burn.burner.slice(0, 6)}...${burn.burner.slice(-4)}`;
  const txHashShort = `${burn.txHash.slice(0, 10)}...`;
  const etherscanTxUrl = `https://etherscan.io/tx/${burn.txHash}`;
  const etherscanAddressUrl = `https://etherscan.io/address/${burn.burner}`;

  // Calculate time since last transaction
  const now = Math.floor(Date.now() / 1000);
  const timeSinceLastTx = stats.lastBurnTimestamp
    ? formatDuration(now - stats.lastBurnTimestamp)
    : "N/A";

  // Format total tokens
  const totalTokens = parseFloat(stats.totalBurned).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  // Format average time between
  const avgTimeBetween = stats.averageTimeBetweenSeconds
    ? formatDuration(stats.averageTimeBetweenSeconds)
    : "N/A";

  // Format top initiators with medals
  const medals = ["🥇", "🥈", "🥉"];
  const topInitiatorsText = stats.topInitiators
    .map((initiator, index) => {
      const addrShort = `${initiator.address.slice(0, 10)}...`;
      const addrUrl = `https://etherscan.io/address/${initiator.address}`;
      return `${medals[index]} <a href="${addrUrl}">${addrShort}</a> - ${initiator.transactionCount} transactions`;
    })
    .join("\n");

  return `🏆 <b>Token Transfer Detected</b>

📁 <b>Most Recent Transaction</b>
<b>Initiator:</b> <a href="${etherscanAddressUrl}">${burnerShort}</a>
<b>Transaction Hash:</b> <a href="${etherscanTxUrl}">${txHashShort}</a>

<b>Time Since Last Transaction:</b> ${timeSinceLastTx}

📊 <b>Aggregate Statistics</b>
<b>Total Tokens Sent:</b> ${totalTokens} tokens
<b>Total Transactions:</b> ${stats.burnCount}
<b>Average Time Between:</b> ${avgTimeBetween}
<b>Total Initiators:</b> ${stats.uniqueInitiatorCount}

<b>Top 3 Initiators:</b>
${topInitiatorsText}

💎 <a href="${etherscanTxUrl}">Ethereum (ETH) Blockchain Explorer</a>
📈 <a href="${config.siteUrl}">View TokenJar Dashboard</a>`;
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
