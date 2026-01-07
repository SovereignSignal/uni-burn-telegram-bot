import { Pool } from "pg";
import type { StoredBurn, BurnStats, ExtendedBurnStats, TopInitiator } from "./types";

let pool: Pool | null = null;

export async function initDatabase(): Promise<Pool> {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL or POSTGRES_URL environment variable is required");
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Test connection
  const client = await pool.connect();
  try {
    await client.query("SELECT NOW()");
    console.log("[Database] PostgreSQL connection established");
  } finally {
    client.release();
  }

  // Run migrations
  await runMigrations();

  console.log("[Database] Initialized PostgreSQL database");
  return pool;
}

async function runMigrations(): Promise<void> {
  if (!pool) throw new Error("Pool not initialized");

  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS burns (
      id SERIAL PRIMARY KEY,
      tx_hash VARCHAR(66) UNIQUE NOT NULL,
      block_number BIGINT NOT NULL,
      timestamp BIGINT NOT NULL,
      uni_amount TEXT NOT NULL,
      uni_amount_raw TEXT NOT NULL,
      burner VARCHAR(42) NOT NULL,
      transfer_from VARCHAR(42),
      destination VARCHAR(20) NOT NULL,
      notified_at BIGINT NOT NULL,
      gas_used TEXT,
      gas_price TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_burns_tx_hash ON burns(tx_hash);
    CREATE INDEX IF NOT EXISTS idx_burns_timestamp ON burns(timestamp);
    CREATE INDEX IF NOT EXISTS idx_burns_block_number ON burns(block_number);
    CREATE INDEX IF NOT EXISTS idx_burns_burner ON burns(burner);

    CREATE TABLE IF NOT EXISTS state (
      key VARCHAR(255) PRIMARY KEY,
      value TEXT NOT NULL
    );
  `;

  await pool.query(createTablesSQL);
}

function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return pool;
}

export async function isBurnNotified(txHash: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT 1 FROM burns WHERE tx_hash = $1",
    [txHash]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function saveBurn(burn: Omit<StoredBurn, "id">): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO burns (tx_hash, block_number, timestamp, uni_amount, uni_amount_raw, burner, transfer_from, destination, notified_at, gas_used, gas_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tx_hash) DO NOTHING`,
    [
      burn.txHash,
      burn.blockNumber,
      burn.timestamp,
      burn.uniAmount,
      burn.uniAmountRaw,
      burn.burner,
      burn.transferFrom || null,
      burn.destination,
      burn.notifiedAt,
      burn.gasUsed || null,
      burn.gasPrice || null,
    ]
  );
}

export async function getBurnStats(): Promise<BurnStats> {
  const pool = getPool();

  const [totalResult, countResult, lastResult] = await Promise.all([
    pool.query("SELECT SUM(CAST(uni_amount_raw AS NUMERIC)) as total FROM burns"),
    pool.query("SELECT COUNT(*) as count FROM burns"),
    pool.query("SELECT MAX(timestamp) as last_ts FROM burns"),
  ]);

  const totalWei = parseFloat(totalResult.rows[0]?.total) || 0;
  const totalUni = totalWei / 1e18;

  return {
    totalBurned: totalUni.toFixed(2),
    burnCount: parseInt(countResult.rows[0]?.count) || 0,
    lastBurnTimestamp: lastResult.rows[0]?.last_ts
      ? parseInt(lastResult.rows[0].last_ts)
      : null,
  };
}

function mapRowToStoredBurn(row: Record<string, unknown>): StoredBurn {
  return {
    id: row.id as number,
    txHash: row.tx_hash as string,
    blockNumber: parseInt(row.block_number as string),
    timestamp: parseInt(row.timestamp as string),
    uniAmount: row.uni_amount as string,
    uniAmountRaw: row.uni_amount_raw as string,
    burner: row.burner as string,
    transferFrom: row.transfer_from as string | undefined,
    destination: row.destination as string,
    notifiedAt: parseInt(row.notified_at as string),
    gasUsed: row.gas_used as string | undefined,
    gasPrice: row.gas_price as string | undefined,
  };
}

export async function getRecentBurns(limit: number = 10): Promise<StoredBurn[]> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT * FROM burns ORDER BY timestamp DESC LIMIT $1",
    [limit]
  );
  return result.rows.map(mapRowToStoredBurn);
}

export async function getTopInitiators(limit: number = 3): Promise<TopInitiator[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT burner as address, COUNT(*) as transaction_count
     FROM burns
     GROUP BY burner
     ORDER BY transaction_count DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => ({
    address: row.address as string,
    transactionCount: parseInt(row.transaction_count as string),
  }));
}

export async function getUniqueInitiatorCount(): Promise<number> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT COUNT(DISTINCT burner) as count FROM burns"
  );
  return parseInt(result.rows[0]?.count) || 0;
}

export async function getAverageTimeBetweenBurns(): Promise<number | null> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT timestamp FROM burns ORDER BY timestamp ASC"
  );

  const rows = result.rows as { timestamp: string }[];

  if (rows.length < 2) {
    return null;
  }

  let totalDiff = 0;
  for (let i = 1; i < rows.length; i++) {
    totalDiff += parseInt(rows[i].timestamp) - parseInt(rows[i - 1].timestamp);
  }

  return totalDiff / (rows.length - 1);
}

export async function getExtendedBurnStats(): Promise<ExtendedBurnStats> {
  const [baseStats, topInitiators, uniqueInitiatorCount, averageTimeBetweenSeconds] =
    await Promise.all([
      getBurnStats(),
      getTopInitiators(3),
      getUniqueInitiatorCount(),
      getAverageTimeBetweenBurns(),
    ]);

  return {
    ...baseStats,
    uniqueInitiatorCount,
    averageTimeBetweenSeconds,
    topInitiators,
  };
}

export async function getLastProcessedBlock(): Promise<bigint | null> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT value FROM state WHERE key = 'lastProcessedBlock'"
  );
  return result.rows[0] ? BigInt(result.rows[0].value) : null;
}

export async function setLastProcessedBlock(blockNumber: bigint): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO state (key, value) VALUES ('lastProcessedBlock', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [blockNumber.toString()]
  );
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[Database] Closed database connection pool");
  }
}
