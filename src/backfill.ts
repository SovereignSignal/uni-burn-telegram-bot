import dotenv from "dotenv";
import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  getAddress,
  type AbiEvent,
  type Address,
  type Log,
} from "viem";
import { mainnet } from "viem/chains";
import { initDatabase, saveBurn, closeDatabase, getBurnStats } from "./database";
import { loadConfig } from "./config";
import type { Config } from "./types";

dotenv.config();

// Firepit was deployed at block 24028203 on December 16, 2025
// First UNI transfers started at block 24116850 on December 29, 2025
const FIREPIT_DEPLOYMENT_BLOCK = 24028203n;

// Alchemy free tier limits
const MAX_BLOCKS_PER_QUERY = 10n; // Alchemy free tier allows max 10 blocks per getLogs query
const DELAY_BETWEEN_CHUNKS_MS = 100; // Small delay to avoid rate limiting

interface TransferEventArgs {
  from: Address;
  to: Address;
  value: bigint;
}

type TransferLog = Log<bigint, number, false> & {
  args: TransferEventArgs;
};

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillBurns(): Promise<void> {
  console.log("=== UNI Burn Backfill Script ===\n");

  // Initialize
  const config = loadConfig();
  await initDatabase();

  const client = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
  });

  const currentBlock = await client.getBlockNumber();
  console.log(`Current block: ${currentBlock}`);
  console.log(`Starting from firepit deployment block: ${FIREPIT_DEPLOYMENT_BLOCK}`);
  console.log(`Total blocks to scan: ${currentBlock - FIREPIT_DEPLOYMENT_BLOCK}\n`);

  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ) as AbiEvent;

  const tokenAddress = getAddress(config.tokenAddress);
  const firepitAddress = getAddress(config.firepitAddress);
  const deadAddress = getAddress(config.burnAddress);

  // Stats
  let totalFirepitBurns = 0;
  let totalDeadBurns = 0;
  let totalSaved = 0;
  let totalSkipped = 0;

  // Process in chunks
  for (let fromBlock = FIREPIT_DEPLOYMENT_BLOCK; fromBlock <= currentBlock; fromBlock += MAX_BLOCKS_PER_QUERY) {
    const toBlock = fromBlock + MAX_BLOCKS_PER_QUERY - 1n > currentBlock
      ? currentBlock
      : fromBlock + MAX_BLOCKS_PER_QUERY - 1n;

    const progress = ((Number(fromBlock - FIREPIT_DEPLOYMENT_BLOCK) / Number(currentBlock - FIREPIT_DEPLOYMENT_BLOCK)) * 100).toFixed(1);
    console.log(`[${progress}%] Scanning blocks ${fromBlock} to ${toBlock}...`);

    try {
      // Fetch transfers to Firepit
      const firepitLogs = await client.getLogs({
        address: tokenAddress,
        event: transferEvent,
        args: { to: firepitAddress },
        fromBlock,
        toBlock,
      }) as unknown as TransferLog[];

      // Fetch transfers to 0xdead
      const deadLogs = await client.getLogs({
        address: tokenAddress,
        event: transferEvent,
        args: { to: deadAddress },
        fromBlock,
        toBlock,
      }) as unknown as TransferLog[];

      if (firepitLogs.length > 0) {
        console.log(`  Found ${firepitLogs.length} Firepit transfers`);
        totalFirepitBurns += firepitLogs.length;
      }
      if (deadLogs.length > 0) {
        console.log(`  Found ${deadLogs.length} dead address transfers`);
        totalDeadBurns += deadLogs.length;
      }

      // Process Firepit burns
      for (const log of firepitLogs) {
        const result = await processAndSaveBurn(client, log, "firepit", config);
        if (result === "saved") totalSaved++;
        else if (result === "skipped") totalSkipped++;
      }

      // Process dead address burns
      for (const log of deadLogs) {
        const result = await processAndSaveBurn(client, log, "dead", config);
        if (result === "saved") totalSaved++;
        else if (result === "skipped") totalSkipped++;
      }
    } catch (error) {
      console.error(`  Error processing blocks ${fromBlock}-${toBlock}:`, error);
      // Wait and retry once
      await sleep(2000);
      console.log("  Retrying...");
      fromBlock -= MAX_BLOCKS_PER_QUERY; // Retry this chunk
    }

    await sleep(DELAY_BETWEEN_CHUNKS_MS);
  }

  // Print summary
  console.log("\n=== Backfill Complete ===");
  console.log(`Total Firepit burns found: ${totalFirepitBurns}`);
  console.log(`Total dead address burns found: ${totalDeadBurns}`);
  console.log(`Burns saved to database: ${totalSaved}`);
  console.log(`Burns skipped (already existed): ${totalSkipped}`);

  // Show final stats
  const stats = await getBurnStats();
  console.log("\n=== Database Statistics ===");
  console.log(`Total burns in database: ${stats.burnCount}`);
  console.log(`Total UNI burned: ${stats.totalBurned}`);

  await closeDatabase();
}

async function processAndSaveBurn(
  client: ReturnType<typeof createPublicClient>,
  log: TransferLog,
  destination: "firepit" | "dead",
  config: Config
): Promise<"saved" | "skipped" | "error"> {
  try {
    if (!log.args.value || !log.args.from || !log.transactionHash || log.blockNumber === null) {
      return "error";
    }

    // Get transaction details
    const [tx, receipt, block] = await Promise.all([
      client.getTransaction({ hash: log.transactionHash }),
      client.getTransactionReceipt({ hash: log.transactionHash }),
      client.getBlock({ blockNumber: log.blockNumber }),
    ]);

    const uniAmount = formatUnits(log.args.value, config.tokenDecimals);
    const uniAmountRaw = log.args.value.toString();

    await saveBurn({
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
      timestamp: Number(block.timestamp),
      uniAmount,
      uniAmountRaw,
      burner: tx.from,
      transferFrom: log.args.from,
      destination,
      notifiedAt: Math.floor(Date.now() / 1000), // Current time for backfilled entries
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString(),
    });

    console.log(`    Saved: ${uniAmount} UNI burned to ${destination} in tx ${log.transactionHash.slice(0, 10)}...`);
    return "saved";
  } catch (error: unknown) {
    // Check if it's a duplicate (already exists)
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("UNIQUE constraint") || errorMessage.includes("duplicate key")) {
      return "skipped";
    }
    console.error(`    Error processing tx ${log.transactionHash}:`, error);
    return "error";
  }
}

// Run the backfill
backfillBurns().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
