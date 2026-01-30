import dotenv from "dotenv";
import { initDatabase, closeDatabase, getBurnStats } from "./database";
import { loadConfig } from "./config";
import { runBackfill } from "./backfillService";

dotenv.config();

async function backfillBurns(): Promise<void> {
  console.log("=== UNI Burn Backfill Script ===\n");

  // Initialize
  const config = loadConfig();
  await initDatabase();

  // Run the backfill
  await runBackfill(config);

  // Show final stats
  const stats = await getBurnStats();
  console.log("\n=== Database Statistics ===");
  console.log(`Total burns in database: ${stats.burnCount}`);
  console.log(`Total UNI burned: ${stats.totalBurned}`);

  await closeDatabase();
}

// Run the backfill
backfillBurns().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
