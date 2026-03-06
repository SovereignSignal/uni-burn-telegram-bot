import dotenv from "dotenv";
import { initDatabase, closeDatabase, getBurnStats } from "./database";
import { loadConfig } from "./config";
import { runBackfill } from "./backfillService";
import { getChainConfig, CHAIN_REGISTRY } from "./chainConfig";

dotenv.config();

async function backfillBurns(): Promise<void> {
  console.log("=== UNI Burn Backfill Script ===\n");

  // Accept chain slug as CLI argument: npm run backfill -- unichain
  const chainArg = process.argv[2];
  const chainConfig = chainArg
    ? getChainConfig(chainArg)
    : CHAIN_REGISTRY["ethereum"];

  if (!chainConfig) {
    console.error(`Unknown chain: ${chainArg}`);
    console.error(`Available chains: ${Object.keys(CHAIN_REGISTRY).join(", ")}`);
    process.exit(1);
  }

  console.log(`Backfilling for chain: ${chainConfig.name}`);

  // Initialize
  const config = loadConfig();
  await initDatabase();

  // Run the backfill
  await runBackfill(config, chainConfig);

  // Show final stats
  const stats = await getBurnStats(chainConfig.id);
  console.log("\n=== Database Statistics ===");
  console.log(`Total burns in database for ${chainConfig.name}: ${stats.burnCount}`);
  console.log(`Total UNI burned: ${stats.totalBurned}`);

  await closeDatabase();
}

// Run the backfill
backfillBurns().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
