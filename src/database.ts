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

  // Create tables if they don't exist (original schema)
  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS burns (
      id SERIAL PRIMARY KEY,
      tx_hash VARCHAR(66) NOT NULL,
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

  // Multi-chain migration: add chain column
  await migrateAddChainColumn();
}

async function migrateAddChainColumn(): Promise<void> {
  if (!pool) throw new Error("Pool not initialized");

  // Check if chain column exists
  const colCheck = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'burns' AND column_name = 'chain'`
  );

  if (colCheck.rowCount === 0) {
    console.log("[Database] Running multi-chain migration...");

    // Add chain column with default 'ethereum' for existing rows
    await pool.query(
      `ALTER TABLE burns ADD COLUMN chain VARCHAR(30) NOT NULL DEFAULT 'ethereum'`
    );

    // Drop old unique constraint on tx_hash (may be named differently)
    // PostgreSQL: find and drop the constraint
    const constraints = await pool.query(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'burns' AND constraint_type = 'UNIQUE'`
    );
    for (const row of constraints.rows) {
      await pool.query(`ALTER TABLE burns DROP CONSTRAINT ${row.constraint_name}`);
    }

    // Add new composite unique constraint
    await pool.query(
      `ALTER TABLE burns ADD CONSTRAINT burns_tx_hash_chain_unique UNIQUE (tx_hash, chain)`
    );

    // Add chain index
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_burns_chain ON burns(chain)`
    );

    // Migrate state key: lastProcessedBlock -> lastProcessedBlock:ethereum
    const stateRow = await pool.query(
      `SELECT value FROM state WHERE key = 'lastProcessedBlock'`
    );
    if (stateRow.rows[0]) {
      await pool.query(
        `INSERT INTO state (key, value) VALUES ('lastProcessedBlock:ethereum', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [stateRow.rows[0].value]
      );
      await pool.query(`DELETE FROM state WHERE key = 'lastProcessedBlock'`);
    }

    console.log("[Database] Multi-chain migration complete");
  }
}

function getPool(): Pool {
  if (!pool) {
    throw new Error("Database not initialized. Call initDatabase first.");
  }
  return pool;
}

export async function isBurnNotified(txHash: string, chain: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT 1 FROM burns WHERE tx_hash = $1 AND chain = $2",
    [txHash, chain]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function saveBurn(burn: Omit<StoredBurn, "id">): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO burns (tx_hash, block_number, timestamp, uni_amount, uni_amount_raw, burner, transfer_from, destination, notified_at, gas_used, gas_price, chain)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (tx_hash, chain) DO NOTHING`,
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
      burn.chain,
    ]
  );
}

export async function getBurnStats(chain?: string): Promise<BurnStats> {
  const pool = getPool();
  const whereClause = chain ? "WHERE chain = $1" : "";
  const params = chain ? [chain] : [];

  const [totalResult, countResult, lastResult] = await Promise.all([
    pool.query(`SELECT SUM(CAST(uni_amount_raw AS NUMERIC)) as total FROM burns ${whereClause}`, params),
    pool.query(`SELECT COUNT(*) as count FROM burns ${whereClause}`, params),
    pool.query(`SELECT MAX(timestamp) as last_ts FROM burns ${whereClause}`, params),
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
    chain: (row.chain as string) || "ethereum",
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

export async function getLastBurn(): Promise<StoredBurn | null> {
  const burns = await getRecentBurns(1);
  return burns[0] || null;
}

export async function getTopInitiators(limit: number = 3, chain?: string): Promise<TopInitiator[]> {
  const pool = getPool();
  const whereClause = chain ? "WHERE chain = $1" : "";
  const params: (string | number)[] = chain ? [chain, limit] : [limit];
  const limitParam = chain ? "$2" : "$1";

  const result = await pool.query(
    `SELECT burner as address, COUNT(*) as transaction_count
     FROM burns
     ${whereClause}
     GROUP BY burner
     ORDER BY transaction_count DESC
     LIMIT ${limitParam}`,
    params
  );
  return result.rows.map((row) => ({
    address: row.address as string,
    transactionCount: parseInt(row.transaction_count as string),
  }));
}

export async function getUniqueInitiatorCount(chain?: string): Promise<number> {
  const pool = getPool();
  const whereClause = chain ? "WHERE chain = $1" : "";
  const params = chain ? [chain] : [];

  const result = await pool.query(
    `SELECT COUNT(DISTINCT burner) as count FROM burns ${whereClause}`,
    params
  );
  return parseInt(result.rows[0]?.count) || 0;
}

export async function getAverageTimeBetweenBurns(chain?: string): Promise<number | null> {
  const pool = getPool();
  const whereClause = chain ? "WHERE chain = $1" : "";
  const params = chain ? [chain] : [];

  const result = await pool.query(
    `SELECT timestamp FROM burns ${whereClause} ORDER BY timestamp ASC`,
    params
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

export async function getExtendedBurnStats(chain?: string): Promise<ExtendedBurnStats> {
  const [baseStats, topInitiators, uniqueInitiatorCount, averageTimeBetweenSeconds] =
    await Promise.all([
      getBurnStats(chain),
      getTopInitiators(3, chain),
      getUniqueInitiatorCount(chain),
      getAverageTimeBetweenBurns(chain),
    ]);

  return {
    ...baseStats,
    uniqueInitiatorCount,
    averageTimeBetweenSeconds,
    topInitiators,
  };
}

export async function getLastProcessedBlock(chain: string): Promise<bigint | null> {
  const pool = getPool();
  const result = await pool.query(
    "SELECT value FROM state WHERE key = $1",
    [`lastProcessedBlock:${chain}`]
  );
  return result.rows[0] ? BigInt(result.rows[0].value) : null;
}

export async function setLastProcessedBlock(blockNumber: bigint, chain: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [`lastProcessedBlock:${chain}`, blockNumber.toString()]
  );
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log("[Database] Closed database connection pool");
  }
}
