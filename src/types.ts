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
  burner: string;
  destination: "firepit" | "dead";
}

export interface StoredBurn {
  id: number;
  txHash: string;
  blockNumber: number;
  timestamp: number;
  uniAmount: string;
  uniAmountRaw: string;
  burner: string;
  destination: string;
  notifiedAt: number;
}

export interface BurnStats {
  totalBurned: string;
  burnCount: number;
  lastBurnTimestamp: number | null;
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
