import { loadConfig } from "./config";
import { initDatabase, isBurnNotified, saveBurn, getExtendedBurnStats, getLastProcessedBlock, setLastProcessedBlock, closeDatabase, getBurnStats } from "./database";
import { initTelegramBot, sendBurnAlert, testConnection, registerStatsCommand, registerDebugCommand, registerPriceCommand } from "./telegramService";
import { initChainClient, getCurrentBlockNumber, fetchBurnsSinceBlock } from "./chainMonitor";
import { formatBurnAlert, formatStartupMessage } from "./formatter";
import { checkNeedsBackfill, runBackfill } from "./backfillService";
import { getEnabledChains } from "./chainConfig";
import { initUniswapApi, getUniPriceUsd } from "./uniswapApi";
import type { ChainConfig } from "./chainConfig";
import type { Config, DebugInfo, ChainDebugInfo } from "./types";

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;

async function processNewBurns(config: Config, chain: ChainConfig): Promise<void> {
  try {
    // Get the last processed block, or start from recent blocks
    let fromBlock = await getLastProcessedBlock(chain.id);

    if (fromBlock === null) {
      // First run: look back ~2 hours based on chain's block time
      const lookbackBlocks = BigInt(Math.ceil(7200 / chain.blockTimeSeconds));
      const currentBlock = await getCurrentBlockNumber(chain.id);
      fromBlock = currentBlock - lookbackBlocks;
      if (fromBlock < 0n) fromBlock = 0n;
      console.log(`[Bot] First run for ${chain.name}, starting from block ${fromBlock}`);
    } else {
      // Continue from the next block after last processed
      fromBlock = fromBlock + 1n;
    }

    // Fetch new burns
    const burns = await fetchBurnsSinceBlock(fromBlock, chain);

    if (burns.length === 0) {
      const currentBlock = await getCurrentBlockNumber(chain.id);
      await setLastProcessedBlock(currentBlock, chain.id);
      return;
    }

    console.log(`[Bot] Found ${burns.length} burn events on ${chain.name} to process`);

    // Process each burn
    for (const burn of burns) {
      // Skip if already notified
      if (await isBurnNotified(burn.txHash, chain.id)) {
        console.log(`[Bot] Skipping already notified burn: ${burn.txHash}`);
        continue;
      }

      // Get current aggregate stats and price for the message
      const [stats, uniPrice] = await Promise.all([
        getExtendedBurnStats(),
        getUniPriceUsd(),
      ]);

      // Format and send the alert
      const message = formatBurnAlert(burn, stats, config, chain, uniPrice);

      try {
        await sendBurnAlert(config.telegramChannelId, message);
        console.log(`[Bot] Sent alert for burn on ${chain.name}: ${burn.txHash}`);

        // Save to database to prevent duplicate notifications
        await saveBurn({
          txHash: burn.txHash,
          blockNumber: burn.blockNumber,
          timestamp: burn.timestamp,
          uniAmount: burn.uniAmount,
          uniAmountRaw: burn.uniAmountRaw,
          burner: burn.initiator,
          transferFrom: burn.transferFrom,
          destination: burn.destination,
          notifiedAt: Date.now(),
          gasUsed: burn.gasUsed,
          gasPrice: burn.gasPrice,
          chain: chain.id,
        });
      } catch (error) {
        console.error(`[Bot] Failed to send alert for ${burn.txHash}:`, error);
        // Don't save to DB so we retry next time
      }

      // Update last processed block after each successful notification
      await setLastProcessedBlock(BigInt(burn.blockNumber), chain.id);
    }

    // Update to current block after processing all
    const currentBlock = await getCurrentBlockNumber(chain.id);
    await setLastProcessedBlock(currentBlock, chain.id);

  } catch (error) {
    console.error(`[Bot] Error processing burns on ${chain.name}:`, error);
  }
}

async function startPolling(config: Config, chains: ChainConfig[]): Promise<void> {
  if (isRunning) {
    console.log("[Bot] Already running");
    return;
  }

  isRunning = true;
  const intervalMs = config.pollIntervalSeconds * 1000;

  console.log(`[Bot] Starting polling every ${config.pollIntervalSeconds} seconds for ${chains.length} chain(s)`);

  // Run immediately on start — sequential to respect shared rate limits
  for (const chain of chains) {
    await processNewBurns(config, chain);
  }

  // Then poll at interval
  pollInterval = setInterval(async () => {
    for (const chain of chains) {
      await processNewBurns(config, chain);
    }
  }, intervalMs);
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  isRunning = false;
  console.log("[Bot] Stopped polling");
}

async function main(): Promise<void> {
  console.log("=".repeat(50));
  console.log("UNI Burn Telegram Bot");
  console.log("=".repeat(50));

  try {
    // Load configuration
    const config = loadConfig();
    console.log("[Bot] Configuration loaded");

    // Resolve enabled chains
    const chains = getEnabledChains(config.enabledChains);
    if (chains.length === 0) {
      console.error("[Bot] No valid chains enabled. Check ENABLED_CHAINS env var.");
      process.exit(1);
    }
    console.log(`[Bot] Enabled chains: ${chains.map((c) => c.name).join(", ")}`);

    // Initialize database
    await initDatabase();

    // Check if we need to backfill historical data per chain
    for (const chain of chains) {
      const needsBackfill = await checkNeedsBackfill(chain.id);
      if (needsBackfill) {
        console.log(`[Bot] Empty database for ${chain.name} - running historical backfill...`);
        console.log("[Bot] This may take several minutes on first run.");
        const backfillResult = await runBackfill(config, chain);
        console.log(`[Bot] Backfill complete for ${chain.name}: ${backfillResult.totalSaved} burns imported`);
      }
    }

    // Initialize Uniswap API for USD pricing
    initUniswapApi(config.uniswapApiKey);

    // Initialize chain clients
    for (const chain of chains) {
      initChainClient(chain, config.alchemyApiKey);
    }

    // Initialize Telegram bot
    initTelegramBot(config);

    // Test Telegram connection
    const connected = await testConnection(config.telegramChannelId);
    if (!connected) {
      console.error("[Bot] Failed to connect to Telegram. Check your bot token and channel ID.");
      process.exit(1);
    }

    // Register command handlers for /stats, /test, and /price
    registerStatsCommand(getExtendedBurnStats, getUniPriceUsd);
    registerPriceCommand(getUniPriceUsd);

    // Register debug command
    registerDebugCommand(async (): Promise<DebugInfo> => {
      const chainInfos: ChainDebugInfo[] = [];
      for (const chain of chains) {
        const currentBlock = await getCurrentBlockNumber(chain.id);
        const lastProcessedBlock = await getLastProcessedBlock(chain.id);
        chainInfos.push({
          chainId: chain.id,
          chainName: chain.name,
          currentBlock,
          lastProcessedBlock,
        });
      }

      const stats = await getBurnStats();

      return {
        chains: chainInfos,
        totalBurnsInDb: stats.burnCount,
        pollIntervalSeconds: config.pollIntervalSeconds,
      };
    });

    // Send startup message
    const startupMessage = formatStartupMessage(config, chains);
    await sendBurnAlert(config.telegramChannelId, startupMessage);
    console.log("[Bot] Startup message sent");

    // Start polling for burns
    await startPolling(config, chains);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\n[Bot] Shutting down...");
      stopPolling();
      await closeDatabase();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

  } catch (error) {
    console.error("[Bot] Fatal error:", error);
    await closeDatabase();
    process.exit(1);
  }
}

// Run the bot
main();
