import Database from "better-sqlite3";
import type { StoredBurn, BurnStats, ExtendedBurnStats, TopInitiator } from "./types";

const DB_PATH = "./burns.db";

let db: Database.Database | null = null;

export function initDatabase(): Database.Database {
  if (db) return db;

  db = new Database(DB_PATH);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS burns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txHash TEXT UNIQUE NOT NULL,
      blockNumber INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      uniAmount TEXT NOT NULL,
      uniAmountRaw TEXT NOT NULL,
      burner TEXT NOT NULL,
      destination TEXT NOT NULL,
      notifiedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_burns_txHash ON burns(txHash);
    CREATE INDEX IF NOT EXISTS idx_burns_timestamp ON burns(timestamp);
    CREATE INDEX IF NOT EXISTS idx_burns_blockNumber ON burns(blockNumber);

    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: Add transferFrom column if it doesn't exist
  try {
    db.exec(`ALTER TABLE burns ADD COLUMN transferFrom TEXT`);
    console.log("[Database] Added transferFrom column");
  } catch {
    // Column already exists, ignore
  }

  console.log("[Database] Initialized SQLite database");
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

export function isBurnNotified(txHash: string): boolean {
  const db = getDatabase();
  const row = db.prepare("SELECT 1 FROM burns WHERE txHash = ?").get(txHash);
  return !!row;
}

export function saveBurn(burn: Omit<StoredBurn, "id">): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR IGNORE INTO burns (txHash, blockNumber, timestamp, uniAmount, uniAmountRaw, burner, transferFrom, destination, notifiedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    burn.txHash,
    burn.blockNumber,
    burn.timestamp,
    burn.uniAmount,
    burn.uniAmountRaw,
    burn.burner,
    burn.transferFrom || null,
    burn.destination,
    burn.notifiedAt
  );
}

export function getBurnStats(): BurnStats {
  const db = getDatabase();

  const totalRow = db
    .prepare("SELECT SUM(CAST(uniAmountRaw AS REAL)) as total FROM burns")
    .get() as { total: number | null };

  const countRow = db
    .prepare("SELECT COUNT(*) as count FROM burns")
    .get() as { count: number };

  const lastRow = db
    .prepare("SELECT MAX(timestamp) as lastTs FROM burns")
    .get() as { lastTs: number | null };

  // Convert from wei to UNI (18 decimals)
  const totalWei = totalRow?.total || 0;
  const totalUni = totalWei / 1e18;

  return {
    totalBurned: totalUni.toFixed(2),
    burnCount: countRow?.count || 0,
    lastBurnTimestamp: lastRow?.lastTs || null,
  };
}

export function getRecentBurns(limit: number = 10): StoredBurn[] {
  const db = getDatabase();
  return db
    .prepare("SELECT * FROM burns ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as StoredBurn[];
}

export function getTopInitiators(limit: number = 3): TopInitiator[] {
  const db = getDatabase();
  const rows = db
    .prepare(`
      SELECT burner as address, COUNT(*) as transactionCount
      FROM burns
      GROUP BY burner
      ORDER BY transactionCount DESC
      LIMIT ?
    `)
    .all(limit) as TopInitiator[];
  return rows;
}

export function getUniqueInitiatorCount(): number {
  const db = getDatabase();
  const row = db
    .prepare("SELECT COUNT(DISTINCT burner) as count FROM burns")
    .get() as { count: number };
  return row?.count || 0;
}

export function getAverageTimeBetweenBurns(): number | null {
  const db = getDatabase();

  // Get all timestamps ordered
  const rows = db
    .prepare("SELECT timestamp FROM burns ORDER BY timestamp ASC")
    .all() as { timestamp: number }[];

  if (rows.length < 2) {
    return null;
  }

  // Calculate average time between consecutive burns
  let totalDiff = 0;
  for (let i = 1; i < rows.length; i++) {
    totalDiff += rows[i].timestamp - rows[i - 1].timestamp;
  }

  return totalDiff / (rows.length - 1);
}

export function getExtendedBurnStats(): ExtendedBurnStats {
  const baseStats = getBurnStats();
  const topInitiators = getTopInitiators(3);
  const uniqueInitiatorCount = getUniqueInitiatorCount();
  const averageTimeBetweenSeconds = getAverageTimeBetweenBurns();

  return {
    ...baseStats,
    uniqueInitiatorCount,
    averageTimeBetweenSeconds,
    topInitiators,
  };
}

export function getLastProcessedBlock(): bigint | null {
  const db = getDatabase();
  const row = db
    .prepare("SELECT value FROM state WHERE key = 'lastProcessedBlock'")
    .get() as { value: string } | undefined;
  return row ? BigInt(row.value) : null;
}

export function setLastProcessedBlock(blockNumber: bigint): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO state (key, value) VALUES ('lastProcessedBlock', ?)
  `).run(blockNumber.toString());
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log("[Database] Closed database connection");
  }
}
