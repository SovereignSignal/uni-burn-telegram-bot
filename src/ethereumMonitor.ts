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
import type { BurnEvent, Config } from "./types";

// Type for ERC-20 Transfer event args
interface TransferEventArgs {
  from: Address;
  to: Address;
  value: bigint;
}

// Type for Transfer event logs
type TransferLog = Log<bigint, number, false> & {
  args: TransferEventArgs;
};

let client: ReturnType<typeof createPublicClient> | null = null;

export function initEthereumClient(config: Config): ReturnType<typeof createPublicClient> {
  if (client) return client;

  client = createPublicClient({
    chain: mainnet,
    transport: http(`https://eth-mainnet.g.alchemy.com/v2/${config.alchemyApiKey}`),
  });

  console.log("[Ethereum] Client initialized with Alchemy");
  return client;
}

export function getEthereumClient(): ReturnType<typeof createPublicClient> {
  if (!client) {
    throw new Error("Ethereum client not initialized. Call initEthereumClient first.");
  }
  return client;
}

export async function getCurrentBlockNumber(): Promise<bigint> {
  const client = getEthereumClient();
  return client.getBlockNumber();
}

const MAX_BLOCKS_PER_QUERY = 10n; // Alchemy free tier limit

/**
 * Fetch Transfer logs in chunks to avoid RPC limits
 */
async function fetchLogsInChunks({
  address,
  event,
  args,
  fromBlock,
  toBlock,
  label,
}: {
  address: Address;
  event: AbiEvent;
  args: { to: Address };
  fromBlock: bigint;
  toBlock: bigint;
  label: string;
}): Promise<TransferLog[]> {
  const client = getEthereumClient();
  const logs: TransferLog[] = [];

  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCKS_PER_QUERY + 1n) {
    const end = start + MAX_BLOCKS_PER_QUERY > toBlock ? toBlock : start + MAX_BLOCKS_PER_QUERY;
    console.log(`[Ethereum] Fetching ${label} logs from block ${start} to ${end}`);

    const chunk = await client.getLogs({
      address,
      event,
      args,
      fromBlock: start,
      toBlock: end,
    });

    logs.push(...(chunk as unknown as TransferLog[]));
  }

  return logs;
}

/**
 * Get transaction data including initiator and gas info
 */
async function getTransactionData(txHash: string): Promise<{
  initiator: Address;
  gasPrice?: string;
  gasUsed?: string;
}> {
  const client = getEthereumClient();
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash as `0x${string}` }),
    client.getTransactionReceipt({ hash: txHash as `0x${string}` }),
  ]);
  return {
    initiator: tx.from,
    gasPrice: tx.gasPrice?.toString(),
    gasUsed: receipt.gasUsed.toString(),
  };
}

/**
 * Get block timestamp
 */
async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const client = getEthereumClient();
  try {
    const block = await client.getBlock({ blockNumber });
    return Number(block.timestamp);
  } catch {
    // Fallback: estimate based on ~12s per block
    const currentBlock = await client.getBlockNumber();
    const blocksAgo = Number(currentBlock - blockNumber);
    return Math.floor(Date.now() / 1000) - blocksAgo * 12;
  }
}

/**
 * Fetch new burn events since a given block
 */
export async function fetchBurnsSinceBlock(
  fromBlock: bigint,
  config: Config
): Promise<BurnEvent[]> {
  const client = getEthereumClient();
  const currentBlock = await client.getBlockNumber();

  if (fromBlock >= currentBlock) {
    return [];
  }

  console.log(`[Ethereum] Scanning blocks ${fromBlock} to ${currentBlock} for burns`);

  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ) as AbiEvent;

  const tokenAddress = getAddress(config.tokenAddress);
  const firepitAddress = getAddress(config.firepitAddress);
  const burnAddress = getAddress(config.burnAddress);

  // Fetch transfers to Firepit
  const firepitLogs = await fetchLogsInChunks({
    address: tokenAddress,
    event: transferEvent,
    args: { to: firepitAddress },
    fromBlock,
    toBlock: currentBlock,
    label: "Firepit",
  });

  // Fetch transfers to 0xdead
  const deadLogs = await fetchLogsInChunks({
    address: tokenAddress,
    event: transferEvent,
    args: { to: burnAddress },
    fromBlock,
    toBlock: currentBlock,
    label: "0xdead",
  });

  console.log(`[Ethereum] Found ${firepitLogs.length} Firepit transfers, ${deadLogs.length} dead transfers`);

  // Combine and deduplicate by txHash
  const burnsByTx = new Map<string, { log: TransferLog; destination: "firepit" | "dead" }>();

  for (const log of firepitLogs) {
    if (!burnsByTx.has(log.transactionHash)) {
      burnsByTx.set(log.transactionHash, { log, destination: "firepit" });
    }
  }

  for (const log of deadLogs) {
    if (!burnsByTx.has(log.transactionHash)) {
      burnsByTx.set(log.transactionHash, { log, destination: "dead" });
    }
  }

  // Convert to BurnEvent array
  const burns: BurnEvent[] = [];

  // Fetch initiators and timestamps in parallel for efficiency
  const burnEntries = Array.from(burnsByTx.entries()).filter(
    ([, { log }]) => log.args.value && log.args.from
  );

  const burnDataPromises = burnEntries.map(async ([txHash, { log, destination }]) => {
    const [timestamp, txData] = await Promise.all([
      getBlockTimestamp(log.blockNumber),
      getTransactionData(txHash),
    ]);

    return {
      txHash,
      blockNumber: Number(log.blockNumber),
      timestamp,
      uniAmount: formatUnits(log.args.value, config.tokenDecimals),
      uniAmountRaw: log.args.value.toString(),
      initiator: txData.initiator,  // The actual tx sender
      transferFrom: log.args.from,  // The Transfer event's from address
      destination,
      gasUsed: txData.gasUsed,
      gasPrice: txData.gasPrice,
    } as BurnEvent;
  });

  burns.push(...(await Promise.all(burnDataPromises)));

  // Sort by block number ascending (oldest first for processing order)
  burns.sort((a, b) => a.blockNumber - b.blockNumber);

  return burns;
}

/**
 * Estimate block number for a given date
 * Uses ~12 seconds per block average
 */
export async function estimateBlockForDate(targetDate: Date): Promise<bigint> {
  const client = getEthereumClient();
  const currentBlock = await client.getBlockNumber();
  const currentTime = Math.floor(Date.now() / 1000);
  const targetTime = Math.floor(targetDate.getTime() / 1000);

  // Estimate based on ~12 seconds per block
  const secondsAgo = currentTime - targetTime;
  const blocksAgo = Math.floor(secondsAgo / 12);

  const estimatedBlock = currentBlock - BigInt(blocksAgo);

  // Ensure we don't go below block 0
  return estimatedBlock > 0n ? estimatedBlock : 1n;
}
