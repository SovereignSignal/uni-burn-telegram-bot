import dotenv from "dotenv";
import type { Config } from "./types";
import type { Address } from "viem";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function loadConfig(): Config {
  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    telegramChannelId: requireEnv("TELEGRAM_CHANNEL_ID"),
    alchemyApiKey: requireEnv("ALCHEMY_API_KEY"),
    pollIntervalSeconds: parseInt(optionalEnv("POLL_INTERVAL_SECONDS", "60"), 10),
    siteUrl: optionalEnv("SITE_URL", "https://tokenjar.xyz"),
    tokenAddress: optionalEnv(
      "TOKEN_ADDRESS",
      "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984"
    ) as Address,
    tokenDecimals: parseInt(optionalEnv("TOKEN_DECIMALS", "18"), 10),
    firepitAddress: optionalEnv(
      "FIREPIT_ADDRESS",
      "0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721"
    ) as Address,
    burnAddress: optionalEnv(
      "BURN_ADDRESS",
      "0x000000000000000000000000000000000000dEaD"
    ) as Address,
    amountThreshold: BigInt(
      optionalEnv("AMOUNT_THRESHOLD", "4000000000000000000000")
    ),
  };
}
