import dotenv from "dotenv";
import type { Config } from "./types";

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
  const enabledChainsRaw = optionalEnv("ENABLED_CHAINS", "ethereum");
  const enabledChains = enabledChainsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  return {
    telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
    telegramChannelId: requireEnv("TELEGRAM_CHANNEL_ID"),
    alchemyApiKey: requireEnv("ALCHEMY_API_KEY"),
    pollIntervalSeconds: parseInt(optionalEnv("POLL_INTERVAL_SECONDS", "60"), 10),
    siteUrl: optionalEnv("SITE_URL", "https://tokenjar.xyz"),
    amountThreshold: BigInt(
      optionalEnv("AMOUNT_THRESHOLD", "4000000000000000000000")
    ),
    enabledChains,
    uniswapApiKey: optionalEnv("UNISWAP_API_KEY", ""),
  };
}
