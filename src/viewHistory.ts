import { initDatabase, getRecentBurns, getBurnStats } from "./database";

function main(): void {
  console.log("=".repeat(50));
  console.log("UNI Burn History");
  console.log("=".repeat(50));

  initDatabase();

  const stats = getBurnStats();
  console.log(`\nTotal Burned: ${stats.totalBurned} UNI`);
  console.log(`Total Burns: ${stats.burnCount}`);

  if (stats.lastBurnTimestamp) {
    const lastBurnDate = new Date(stats.lastBurnTimestamp * 1000);
    console.log(`Last Burn: ${lastBurnDate.toLocaleString()}`);
  }

  console.log("\n" + "-".repeat(50));
  console.log("Recent Burns:");
  console.log("-".repeat(50));

  const burns = getRecentBurns(20);

  if (burns.length === 0) {
    console.log("No burns recorded yet.");
    return;
  }

  for (const burn of burns) {
    const date = new Date(burn.timestamp * 1000);
    const amount = parseFloat(burn.uniAmount).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
    const burnerShort = `${burn.burner.slice(0, 6)}...${burn.burner.slice(-4)}`;

    console.log(`\n${date.toLocaleString()}`);
    console.log(`  Amount: ${amount} UNI`);
    console.log(`  Burner: ${burnerShort}`);
    console.log(`  Destination: ${burn.destination}`);
    console.log(`  Tx: https://etherscan.io/tx/${burn.txHash}`);
  }
}

main();
