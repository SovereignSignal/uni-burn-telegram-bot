import { loadConfig } from "./config";
import { initDatabase, isBurnNotified, saveBurn, getBurnStats, getLastProcessedBlock, setLastProcessedBlock, closeDatabase } from "./database";
import { initTelegramBot, sendBurnAlert, testConnection } from "./telegramService";
import { initEthereumClient, getCurrentBlockNumber, fetchBurnsSinceBlock } from "./ethereumMonitor";
import { formatBurnAlert, formatStartupMessage } from "./formatter";
import type { Config } from "./types";

// How many blocks to look back on first run (roughly 1 hour at 12s/block)
const INITIAL_LOOKBACK_BLOCKS = 300n;

let isRunning = false;
let pollInterval: NodeJS.Timeout | null = null;

async function processNewBurns(config: Config): Promise<void> {
  try {
    // Get the last processed block, or start from recent blocks
    let fromBlock = getLastProcessedBlock();

    if (fromBlock === null) {
      // First run: look back a bit to catch any recent burns
      const currentBlock = await getCurrentBlockNumber();
      fromBlock = currentBlock - INITIAL_LOOKBACK_BLOCKS;
      console.log(`[Bot] First run, starting from block ${fromBlock}`);
    } else {
      // Continue from the next block after last processed
      fromBlock = fromBlock + 1n;
    }

    // Fetch new burns
    const burns = await fetchBurnsSinceBlock(fromBlock, config);

    if (burns.length === 0) {
      const currentBlock = await getCurrentBlockNumber();
      setLastProcessedBlock(currentBlock);
      return;
    }

    console.log(`[Bot] Found ${burns.length} burn events to process`);

    // Process each burn
    for (const burn of burns) {
      // Skip if already notified
      if (isBurnNotified(burn.txHash)) {
        console.log(`[Bot] Skipping already notified burn: ${burn.txHash}`);
        continue;
      }

      // Get current stats for the message
      const stats = getBurnStats();

      // Format and send the alert
      const message = formatBurnAlert(burn, stats, config);

      try {
        await sendBurnAlert(config.telegramChannelId, message);
        console.log(`[Bot] Sent alert for burn: ${burn.txHash}`);

        // Save to database to prevent duplicate notifications
        saveBurn({
          txHash: burn.txHash,
          blockNumber: burn.blockNumber,
          timestamp: burn.timestamp,
          uniAmount: burn.uniAmount,
          uniAmountRaw: burn.uniAmountRaw,
          burner: burn.burner,
          destination: burn.destination,
          notifiedAt: Date.now(),
        });
      } catch (error) {
        console.error(`[Bot] Failed to send alert for ${burn.txHash}:`, error);
        // Don't save to DB so we retry next time
      }

      // Update last processed block after each successful notification
      setLastProcessedBlock(BigInt(burn.blockNumber));
    }

    // Update to current block after processing all
    const currentBlock = await getCurrentBlockNumber();
    setLastProcessedBlock(currentBlock);

  } catch (error) {
    console.error("[Bot] Error processing burns:", error);
  }
}

async function startPolling(config: Config): Promise<void> {
  if (isRunning) {
    console.log("[Bot] Already running");
    return;
  }

  isRunning = true;
  const intervalMs = config.pollIntervalSeconds * 1000;

  console.log(`[Bot] Starting polling every ${config.pollIntervalSeconds} seconds`);

  // Run immediately on start
  await processNewBurns(config);

  // Then poll at interval
  pollInterval = setInterval(async () => {
    await processNewBurns(config);
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

    // Initialize database
    initDatabase();

    // Initialize Ethereum client
    initEthereumClient(config);

    // Initialize Telegram bot
    initTelegramBot(config);

    // Test Telegram connection
    const connected = await testConnection(config.telegramChannelId);
    if (!connected) {
      console.error("[Bot] Failed to connect to Telegram. Check your bot token and channel ID.");
      process.exit(1);
    }

    // Send startup message
    const startupMessage = formatStartupMessage(config);
    await sendBurnAlert(config.telegramChannelId, startupMessage);
    console.log("[Bot] Startup message sent");

    // Start polling for burns
    await startPolling(config);

    // Handle graceful shutdown
    const shutdown = () => {
      console.log("\n[Bot] Shutting down...");
      stopPolling();
      closeDatabase();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

  } catch (error) {
    console.error("[Bot] Fatal error:", error);
    closeDatabase();
    process.exit(1);
  }
}

// Run the bot
main();
