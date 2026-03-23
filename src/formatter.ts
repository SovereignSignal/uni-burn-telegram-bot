import type { BurnEvent, ExtendedBurnStats, StoredBurn, PeriodBurnStats, TopInitiator } from "./types";
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
  chain: ChainConfig,
  uniPriceUsd: number | null = null
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

  // Format the actual burn amount with optional USD
  const burnAmountNum = parseFloat(burn.uniAmount);
  const formattedAmount = burnAmountNum.toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
  const amountUsd = uniPriceUsd
    ? ` (~$${(burnAmountNum * uniPriceUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
    : "";

  // Format total with optional USD
  const totalBurnedNum = parseFloat(stats.totalBurned);
  const totalUsd = uniPriceUsd
    ? ` (~$${(totalBurnedNum * uniPriceUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
    : "";

  // Chain label: omit "on Ethereum" to preserve current format
  const title = chain.id === "ethereum"
    ? "🔥 <b>UNI Burn Detected</b>"
    : `🔥 <b>UNI Burn Detected on ${chain.name}</b>`;

  return `${title}

📁 <b>Latest Burn</b>
<b>Searcher:</b> <a href="${addressUrl}">${initiatorShort}</a>
<b>Transaction:</b> <a href="${txUrl}">${txHashShort}</a>
<b>Amount:</b> ${formattedAmount} UNI${amountUsd}

<b>Time Since Last Burn:</b> ${timeSinceLastTx}

📊 <b>Aggregate Statistics</b>
<b>Total UNI Burned:</b> ${totalTokens} UNI${totalUsd}
<b>Total Burns:</b> ${stats.burnCount}
<b>Average Time Between:</b> ${avgTimeBetween}
<b>Unique Searchers:</b> ${stats.uniqueInitiatorCount}

<b>Top Searchers:</b>
${topSearchersText}

💎 <a href="${txUrl}">View on ${chain.explorerName}</a>`;
}

/**
 * Format a threshold approaching alert
 */
export function formatThresholdAlert(
  uniToThreshold: number,
  currentJarValueUsd: number
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
Current Jar Value: <b>${formattedUsd}</b>`;
}

/**
 * Format a startup/test message
 */
export function formatStartupMessage(chains: ChainConfig[]): string {
  const chainNames = chains.map((c) => c.name).join(", ");
  return `🤖 <b>UNI Burn Bot Online</b>

Monitoring UNI token burns to Firepit and 0xdead addresses.
<b>Chains:</b> ${chainNames}
Alerts will be posted here when burns are detected.`;
}

/**
 * Format a compact burn summary for inline query results
 */
export function formatInlineBurnResult(burn: StoredBurn, chain: ChainConfig, uniPriceUsd: number | null = null): string {
  const initiatorShort = `${burn.burner.slice(0, 6)}...${burn.burner.slice(-4)}`;
  const txHashShort = `${burn.txHash.slice(0, 10)}...`;
  const txUrl = getExplorerTxUrl(chain, burn.txHash);
  const addressUrl = getExplorerAddressUrl(chain, burn.burner);

  const burnAmountNum = parseFloat(burn.uniAmount);
  const formattedAmount = burnAmountNum.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const amountUsd = uniPriceUsd
    ? ` (~$${(burnAmountNum * uniPriceUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
    : "";

  const timeSince = formatDuration(Math.floor(Date.now() / 1000) - burn.timestamp);

  const title = chain.id === "ethereum"
    ? "🔥 <b>UNI Burn</b>"
    : `🔥 <b>UNI Burn on ${chain.name}</b>`;

  return `${title}
<b>Amount:</b> ${formattedAmount} UNI${amountUsd}
<b>Searcher:</b> <a href="${addressUrl}">${initiatorShort}</a>
<b>Tx:</b> <a href="${txUrl}">${txHashShort}</a>
<b>Time:</b> ${timeSince} ago`;
}

/**
 * Format a daily or weekly digest message
 */
export function formatDigestMessage(
  period: "daily" | "weekly",
  stats: PeriodBurnStats,
  topSearcher: TopInitiator | null,
  uniPriceUsd: number | null
): string {
  const periodLabel = period === "daily" ? "Daily" : "Weekly";

  if (stats.burnCount === 0) {
    const timeframe = period === "daily" ? "24 hours" : "7 days";
    return `📋 <b>${periodLabel} UNI Burn Digest</b>\n\nNo burns recorded in the last ${timeframe}.`;
  }

  const totalBurnedNum = parseFloat(stats.totalBurned);
  const totalUni = totalBurnedNum.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const totalUsd = uniPriceUsd
    ? ` (~$${(totalBurnedNum * uniPriceUsd).toLocaleString("en-US", { maximumFractionDigits: 0 })})`
    : "";

  // Top chain by burn count
  const topChain = stats.chainBreakdown[0];
  const topChainName = topChain
    ? (CHAIN_REGISTRY[topChain.chain]?.name || topChain.chain)
    : "N/A";
  const topChainLine = topChain
    ? `⛓️ <b>Top Chain:</b> ${topChainName} (${topChain.burnCount} burns)`
    : "";

  // Top searcher
  const topSearcherLine = topSearcher
    ? `🏆 <b>Top Searcher:</b> <a href="${getExplorerAddressUrl(CHAIN_REGISTRY["ethereum"], topSearcher.address)}">${topSearcher.address.slice(0, 10)}...</a> (${topSearcher.transactionCount} burns)`
    : "";

  // Price line
  const priceLine = uniPriceUsd
    ? `💰 <b>UNI Price:</b> $${uniPriceUsd.toFixed(4)}`
    : "";

  // Chain breakdown (only if multi-chain)
  let breakdownLines = "";
  if (stats.chainBreakdown.length > 1) {
    breakdownLines = "\n\n<b>By Chain:</b>\n" + stats.chainBreakdown.map((c) => {
      const name = CHAIN_REGISTRY[c.chain]?.name || c.chain;
      const burned = parseFloat(c.totalBurned).toLocaleString("en-US", { maximumFractionDigits: 0 });
      return `  ${name}: ${c.burnCount} burns (${burned} UNI)`;
    }).join("\n");
  }

  const lines = [
    `📋 <b>${periodLabel} UNI Burn Digest</b>`,
    "",
    `🔥 <b>Burns:</b> ${stats.burnCount}`,
    `💎 <b>UNI Burned:</b> ${totalUni} UNI${totalUsd}`,
    topChainLine,
    topSearcherLine,
    priceLine,
    breakdownLines,
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Format an error message (for admin notifications if needed)
 */
export function formatErrorMessage(error: string): string {
  return `⚠️ <b>Bot Error</b>

${error}

The bot will continue attempting to monitor burns.`;
}
