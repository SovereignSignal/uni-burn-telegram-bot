import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  getAddress,
  type AbiEvent,
  type Address,
  type Log,
  type PublicClient,
} from "viem";
import type { BurnEvent } from "./types";
import type { ChainConfig } from "./chainConfig";
import { getAlchemyRpcUrl } from "./chainConfig";

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

const clients = new Map<string, PublicClient>();

export function initChainClient(chain: ChainConfig, alchemyApiKey: string): PublicClient {
  const existing = clients.get(chain.id);
  if (existing) return existing;

  const client = createPublicClient({
    chain: chain.viemChain,
    transport: http(getAlchemyRpcUrl(chain, alchemyApiKey)),
  }) as PublicClient;

  clients.set(chain.id, client);
  console.log(`[ChainMonitor] Client initialized for ${chain.name}`);
  return client;
}

export function getChainClient(chainId: string): PublicClient {
  const client = clients.get(chainId);
  if (!client) {
    throw new Error(`Chain client not initialized for ${chainId}. Call initChainClient first.`);
  }
  return client;
}

export async function getCurrentBlockNumber(chainId: string): Promise<bigint> {
  const client = getChainClient(chainId);
  return client.getBlockNumber();
}

/**
 * Fetch Transfer logs in chunks to avoid RPC limits
 */
async function fetchLogsInChunks({
  client,
  address,
  event,
  args,
  fromBlock,
  toBlock,
  maxBlocksPerQuery,
  label,
  chainName,
}: {
  client: PublicClient;
  address: Address;
  event: AbiEvent;
  args: { to: Address };
  fromBlock: bigint;
  toBlock: bigint;
  maxBlocksPerQuery: bigint;
  label: string;
  chainName: string;
}): Promise<TransferLog[]> {
  const logs: TransferLog[] = [];

  for (let start = fromBlock; start <= toBlock; start += maxBlocksPerQuery + 1n) {
    const end = start + maxBlocksPerQuery > toBlock ? toBlock : start + maxBlocksPerQuery;
    console.log(`[${chainName}] Fetching ${label} logs from block ${start} to ${end}`);

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
async function getTransactionData(client: PublicClient, txHash: string): Promise<{
  initiator: Address;
  gasPrice?: string;
  gasUsed?: string;
}> {
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
async function getBlockTimestamp(client: PublicClient, blockNumber: bigint, blockTimeSeconds: number): Promise<number> {
  try {
    const block = await client.getBlock({ blockNumber });
    return Number(block.timestamp);
  } catch {
    // Fallback: estimate based on chain's block time
    const currentBlock = await client.getBlockNumber();
    const blocksAgo = Number(currentBlock - blockNumber);
    return Math.floor(Date.now() / 1000) - blocksAgo * blockTimeSeconds;
  }
}

/**
 * Fetch new burn events since a given block for a specific chain
 */
export async function fetchBurnsSinceBlock(
  fromBlock: bigint,
  chain: ChainConfig
): Promise<BurnEvent[]> {
  const client = getChainClient(chain.id);
  const currentBlock = await client.getBlockNumber();

  if (fromBlock >= currentBlock) {
    return [];
  }

  console.log(`[${chain.name}] Scanning blocks ${fromBlock} to ${currentBlock} for burns`);

  const transferEvent = parseAbiItem(
    "event Transfer(address indexed from, address indexed to, uint256 value)"
  ) as AbiEvent;

  const tokenAddress = getAddress(chain.tokenAddress);
  const firepitAddress = getAddress(chain.firepitAddress);
  const burnAddress = getAddress(chain.burnAddress);

  // Fetch transfers to Firepit
  const firepitLogs = await fetchLogsInChunks({
    client,
    address: tokenAddress,
    event: transferEvent,
    args: { to: firepitAddress },
    fromBlock,
    toBlock: currentBlock,
    maxBlocksPerQuery: chain.maxBlocksPerQuery,
    label: "Firepit",
    chainName: chain.name,
  });

  // Fetch transfers to 0xdead
  const deadLogs = await fetchLogsInChunks({
    client,
    address: tokenAddress,
    event: transferEvent,
    args: { to: burnAddress },
    fromBlock,
    toBlock: currentBlock,
    maxBlocksPerQuery: chain.maxBlocksPerQuery,
    label: "0xdead",
    chainName: chain.name,
  });

  console.log(`[${chain.name}] Found ${firepitLogs.length} Firepit transfers, ${deadLogs.length} dead transfers`);

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
  const burnEntries = Array.from(burnsByTx.entries()).filter(
    ([, { log }]) => log.args.value && log.args.from
  );

  const burnDataPromises = burnEntries.map(async ([txHash, { log, destination }]) => {
    const [timestamp, txData] = await Promise.all([
      getBlockTimestamp(client, log.blockNumber, chain.blockTimeSeconds),
      getTransactionData(client, txHash),
    ]);

    return {
      txHash,
      blockNumber: Number(log.blockNumber),
      timestamp,
      uniAmount: formatUnits(log.args.value, chain.tokenDecimals),
      uniAmountRaw: log.args.value.toString(),
      initiator: txData.initiator,
      transferFrom: log.args.from,
      destination,
      gasUsed: txData.gasUsed,
      gasPrice: txData.gasPrice,
      chain: chain.id,
    } as BurnEvent;
  });

  const burns = await Promise.all(burnDataPromises);

  // Sort by block number ascending (oldest first for processing order)
  burns.sort((a, b) => a.blockNumber - b.blockNumber);

  return burns;
}

/**
 * Estimate block number for a given date on a specific chain
 */
export async function estimateBlockForDate(chainId: string, targetDate: Date, blockTimeSeconds: number): Promise<bigint> {
  const client = getChainClient(chainId);
  const currentBlock = await client.getBlockNumber();
  const currentTime = Math.floor(Date.now() / 1000);
  const targetTime = Math.floor(targetDate.getTime() / 1000);

  const secondsAgo = currentTime - targetTime;
  const blocksAgo = Math.floor(secondsAgo / blockTimeSeconds);

  const estimatedBlock = currentBlock - BigInt(blocksAgo);
  return estimatedBlock > 0n ? estimatedBlock : 1n;
}
