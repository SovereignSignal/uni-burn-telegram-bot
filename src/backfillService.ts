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
import { saveBurn, getBurnStats } from "./database";
import type { Config } from "./types";
import type { ChainConfig } from "./chainConfig";
import { getAlchemyRpcUrl, CHAIN_REGISTRY } from "./chainConfig";

// Delay between chunks for rate limiting
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

export async function checkNeedsBackfill(chain?: string): Promise<boolean> {
  const stats = await getBurnStats(chain);
  return stats.burnCount === 0;
}

export async function runBackfill(
  config: Config,
  chain?: ChainConfig,
  options?: { silent?: boolean }
): Promise<BackfillResult> {
  // Default to ethereum for backwards compatibility
  const chainConfig = chain || CHAIN_REGISTRY["ethereum"];
  const log = options?.silent ? () => {} : console.log.bind(console);

  log(`[Backfill] Starting historical burn backfill for ${chainConfig.name}...`);

  const client = createPublicClient({
    chain: chainConfig.viemChain,
    transport: http(getAlchemyRpcUrl(chainConfig, config.alchemyApiKey)),
  });

  const currentBlock = await client.getBlockNumber();
  const deploymentBlock = chainConfig.deploymentBlock;
  const maxBlocksPerQuery = chainConfig.maxBlocksPerQuery;

  log(`[Backfill] Current block: ${currentBlock}`);
  log(`[Backfill] Starting from deployment block: ${deploymentBlock}`);
  log(`[Backfill] Total blocks to scan: ${currentBlock - deploymentBlock}`);

  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ) as AbiEvent;

  const tokenAddress = getAddress(chainConfig.tokenAddress);
  const firepitAddress = getAddress(chainConfig.firepitAddress);
  const deadAddress = getAddress(chainConfig.burnAddress);

  const result: BackfillResult = {
    totalFirepitBurns: 0,
    totalDeadBurns: 0,
    totalSaved: 0,
    totalSkipped: 0,
  };

  // Process in chunks
  for (let fromBlock = deploymentBlock; fromBlock <= currentBlock; fromBlock += maxBlocksPerQuery) {
    const toBlock = fromBlock + maxBlocksPerQuery - 1n > currentBlock
      ? currentBlock
      : fromBlock + maxBlocksPerQuery - 1n;

    const progress = ((Number(fromBlock - deploymentBlock) / Number(currentBlock - deploymentBlock)) * 100).toFixed(1);
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
        const saveResult = await processAndSaveBurn(client, logEntry, "firepit", chainConfig, log);
        if (saveResult === "saved") result.totalSaved++;
        else if (saveResult === "skipped") result.totalSkipped++;
      }

      // Process dead address burns
      for (const logEntry of deadLogs) {
        const saveResult = await processAndSaveBurn(client, logEntry, "dead", chainConfig, log);
        if (saveResult === "saved") result.totalSaved++;
        else if (saveResult === "skipped") result.totalSkipped++;
      }
    } catch (error) {
      console.error(`[Backfill] Error processing blocks ${fromBlock}-${toBlock}:`, error);
      // Wait and retry once
      await sleep(2000);
      log("[Backfill] Retrying...");
      fromBlock -= maxBlocksPerQuery; // Retry this chunk
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
  chainConfig: ChainConfig,
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

    const uniAmount = formatUnits(logEntry.args.value, chainConfig.tokenDecimals);
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
      chain: chainConfig.id,
    });

    log(`[Backfill]     Saved: ${uniAmount} UNI burned to ${destination} on ${chainConfig.name} in tx ${logEntry.transactionHash.slice(0, 10)}...`);
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
