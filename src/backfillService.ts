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
import { saveBurn, getBurnStats } from "./database";
import type { Config } from "./types";

// Firepit was deployed at block 24028203 on December 16, 2025
// First UNI transfers started at block 24116850 on December 29, 2025
const FIREPIT_DEPLOYMENT_BLOCK = 24028203n;

// Alchemy free tier limits
const MAX_BLOCKS_PER_QUERY = 10n;
const DELAY_BETWEEN_CHUNKS_MS = 100;

interface TransferEventArgs {
  from: Address;
  to: Address;
  value: bigint;
}

type TransferLog = Log<bigint, number, false> & {
  args: TransferEventArgs;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BackfillResult {
  totalFirepitBurns: number;
  totalDeadBurns: number;
  totalSaved: number;
  totalSkipped: number;
}

export async function checkNeedsBackfill(): Promise<boolean> {
  const stats = await getBurnStats();
  return stats.burnCount === 0;
}

export async function runBackfill(
  config: Config,
  options?: { silent?: boolean }
): Promise<BackfillResult> {
  const log = options?.silent ? () => {} : console.log.bind(console);

  log("[Backfill] Starting historical burn backfill...");

  const client = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
  });

  const currentBlock = await client.getBlockNumber();
  log(`[Backfill] Current block: ${currentBlock}`);
  log(`[Backfill] Starting from firepit deployment block: ${FIREPIT_DEPLOYMENT_BLOCK}`);
  log(`[Backfill] Total blocks to scan: ${currentBlock - FIREPIT_DEPLOYMENT_BLOCK}`);

  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ) as AbiEvent;

  const tokenAddress = getAddress(config.tokenAddress);
  const firepitAddress = getAddress(config.firepitAddress);
  const deadAddress = getAddress(config.burnAddress);

  const result: BackfillResult = {
    totalFirepitBurns: 0,
    totalDeadBurns: 0,
    totalSaved: 0,
    totalSkipped: 0,
  };

  // Process in chunks
  for (let fromBlock = FIREPIT_DEPLOYMENT_BLOCK; fromBlock <= currentBlock; fromBlock += MAX_BLOCKS_PER_QUERY) {
    const toBlock = fromBlock + MAX_BLOCKS_PER_QUERY - 1n > currentBlock
      ? currentBlock
      : fromBlock + MAX_BLOCKS_PER_QUERY - 1n;

    const progress = ((Number(fromBlock - FIREPIT_DEPLOYMENT_BLOCK) / Number(currentBlock - FIREPIT_DEPLOYMENT_BLOCK)) * 100).toFixed(1);
    log(`[Backfill] [${progress}%] Scanning blocks ${fromBlock} to ${toBlock}...`);

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
        log(`[Backfill]   Found ${firepitLogs.length} Firepit transfers`);
        result.totalFirepitBurns += firepitLogs.length;
      }
      if (deadLogs.length > 0) {
        log(`[Backfill]   Found ${deadLogs.length} dead address transfers`);
        result.totalDeadBurns += deadLogs.length;
      }

      // Process Firepit burns
      for (const logEntry of firepitLogs) {
        const saveResult = await processAndSaveBurn(client, logEntry, "firepit", config, log);
        if (saveResult === "saved") result.totalSaved++;
        else if (saveResult === "skipped") result.totalSkipped++;
      }

      // Process dead address burns
      for (const logEntry of deadLogs) {
        const saveResult = await processAndSaveBurn(client, logEntry, "dead", config, log);
        if (saveResult === "saved") result.totalSaved++;
        else if (saveResult === "skipped") result.totalSkipped++;
      }
    } catch (error) {
      console.error(`[Backfill] Error processing blocks ${fromBlock}-${toBlock}:`, error);
      // Wait and retry once
      await sleep(2000);
      log("[Backfill] Retrying...");
      fromBlock -= MAX_BLOCKS_PER_QUERY; // Retry this chunk
    }

    await sleep(DELAY_BETWEEN_CHUNKS_MS);
  }

  log("[Backfill] === Backfill Complete ===");
  log(`[Backfill] Total Firepit burns found: ${result.totalFirepitBurns}`);
  log(`[Backfill] Total dead address burns found: ${result.totalDeadBurns}`);
  log(`[Backfill] Burns saved to database: ${result.totalSaved}`);
  log(`[Backfill] Burns skipped (already existed): ${result.totalSkipped}`);

  return result;
}

async function processAndSaveBurn(
  client: ReturnType<typeof createPublicClient>,
  logEntry: TransferLog,
  destination: "firepit" | "dead",
  config: Config,
  log: (...args: unknown[]) => void
): Promise<"saved" | "skipped" | "error"> {
  try {
    if (!logEntry.args.value || !logEntry.args.from || !logEntry.transactionHash || logEntry.blockNumber === null) {
      return "error";
    }

    // Get transaction details
    const [tx, receipt, block] = await Promise.all([
      client.getTransaction({ hash: logEntry.transactionHash }),
      client.getTransactionReceipt({ hash: logEntry.transactionHash }),
      client.getBlock({ blockNumber: logEntry.blockNumber }),
    ]);

    const uniAmount = formatUnits(logEntry.args.value, config.tokenDecimals);
    const uniAmountRaw = logEntry.args.value.toString();

    await saveBurn({
      txHash: logEntry.transactionHash,
      blockNumber: Number(logEntry.blockNumber),
      timestamp: Number(block.timestamp),
      uniAmount,
      uniAmountRaw,
      burner: tx.from,
      transferFrom: logEntry.args.from,
      destination,
      notifiedAt: Math.floor(Date.now() / 1000),
      gasUsed: receipt.gasUsed.toString(),
      gasPrice: tx.gasPrice?.toString(),
    });

    log(`[Backfill]     Saved: ${uniAmount} UNI burned to ${destination} in tx ${logEntry.transactionHash.slice(0, 10)}...`);
    return "saved";
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("UNIQUE constraint") || errorMessage.includes("duplicate key")) {
      return "skipped";
    }
    console.error(`[Backfill] Error processing tx ${logEntry.transactionHash}:`, error);
    return "error";
  }
}
