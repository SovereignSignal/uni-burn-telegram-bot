import type { BurnEvent, ExtendedBurnStats, Config } from "./types";
import type { ChainConfig } from "./chainConfig";
import { getExplorerTxUrl, getExplorerAddressUrl, CHAIN_REGISTRY } from "./chainConfig";

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
 */
export function formatBurnAlert(
  burn: BurnEvent,
  stats: ExtendedBurnStats,
  config: Config,
  chain: ChainConfig
): string {
  const initiatorShort = `${burn.initiator.slice(0, 6)}...${burn.initiator.slice(-4)}`;
  const txHashShort = `${burn.txHash.slice(0, 10)}...`;
  const txUrl = getExplorerTxUrl(chain, burn.txHash);
  const addressUrl = getExplorerAddressUrl(chain, burn.initiator);

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

  // Format top searchers with medals (use ethereum explorer for aggregate stats)
  const defaultExplorer = CHAIN_REGISTRY["ethereum"];
  const medals = ["🥇", "🥈", "🥉"];
  const topSearchersText = stats.topInitiators
    .map((searcher, index) => {
      const addrShort = `${searcher.address.slice(0, 10)}...`;
      const addrUrl = getExplorerAddressUrl(defaultExplorer, searcher.address);
      return `${medals[index]} <a href="${addrUrl}">${addrShort}</a> - ${searcher.transactionCount} burns`;
    })
    .join("\n");

  // Format the actual burn amount
  const formattedAmount = parseFloat(burn.uniAmount).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });

  // Chain label: omit "on Ethereum" to preserve current format
  const title = chain.id === "ethereum"
    ? "🔥 <b>UNI Burn Detected</b>"
    : `🔥 <b>UNI Burn Detected on ${chain.name}</b>`;

  return `${title}

📁 <b>Latest Burn</b>
<b>Searcher:</b> <a href="${addressUrl}">${initiatorShort}</a>
<b>Transaction:</b> <a href="${txUrl}">${txHashShort}</a>
<b>Amount:</b> ${formattedAmount} UNI

<b>Time Since Last Burn:</b> ${timeSinceLastTx}

📊 <b>Aggregate Statistics</b>
<b>Total UNI Burned:</b> ${totalTokens} UNI
<b>Total Burns:</b> ${stats.burnCount}
<b>Average Time Between:</b> ${avgTimeBetween}
<b>Unique Searchers:</b> ${stats.uniqueInitiatorCount}

<b>Top Searchers:</b>
${topSearchersText}

💎 <a href="${txUrl}">View on ${chain.explorerName}</a>
📈 <a href="${config.siteUrl}">TokenJar Dashboard</a>`;
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
export function formatStartupMessage(config: Config, chains: ChainConfig[]): string {
  const chainNames = chains.map((c) => c.name).join(", ");
  return `🤖 <b>UNI Burn Bot Online</b>

Monitoring UNI token burns to Firepit and 0xdead addresses.
<b>Chains:</b> ${chainNames}
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
