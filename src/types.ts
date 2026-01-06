import type { Address } from "viem";

export interface TransferEvent {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  from: Address;
  to: Address;
  value: bigint;
  valueFormatted: string;
}

export interface BurnEvent {
  txHash: string;
  blockNumber: number;
  timestamp: number;
  uniAmount: string;
  uniAmountRaw: string;
  initiator: string;      // The actual tx.from (transaction sender)
  transferFrom: string;   // The Transfer event's from address (may be intermediate contract)
  destination: "firepit" | "dead";
  gasUsed?: string;       // Gas used by the transaction
  gasPrice?: string;      // Gas price in wei
}

export interface StoredBurn {
  id: number;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  uniAmount: string;
  uniAmountRaw: string;
  burner: string;           // Stores the initiator (tx.from) for backward compat
  transferFrom?: string;    // The Transfer event's from address
  destination: string;
  notifiedAt: number;
  gasUsed?: string;         // Gas used by the transaction
  gasPrice?: string;        // Gas price in wei
}

export interface BurnStats {
  totalBurned: string;
  burnCount: number;
  lastBurnTimestamp: number | null;
}

export interface TopInitiator {
  address: string;
  transactionCount: number;
}

export interface ExtendedBurnStats extends BurnStats {
  uniqueInitiatorCount: number;
  averageTimeBetweenSeconds: number | null;
  topInitiators: TopInitiator[];
}

export interface Config {
  telegramBotToken: string;
  telegramChannelId: string;
  alchemyApiKey: string;
  pollIntervalSeconds: number;
  siteUrl: string;
  tokenAddress: Address;
  tokenDecimals: number;
  firepitAddress: Address;
  burnAddress: Address;
  amountThreshold: bigint;
}
