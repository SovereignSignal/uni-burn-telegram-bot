# CLAUDE.md - AI Assistant Guide

This document provides essential context for AI assistants working with the UNI Burn Telegram Bot codebase.

## Project Overview

A Telegram bot that monitors UNI token burns across multiple EVM chains and sends real-time alerts to a Telegram channel. The bot tracks transfers to the Firepit contract and the 0xdead burn address, stores burn events in PostgreSQL, and provides statistics via bot commands.

## Tech Stack

- **Runtime**: Node.js (>=18.0.0)
- **Language**: TypeScript (ES2022, strict mode)
- **Blockchain**: [viem](https://viem.sh/) for multi-chain EVM interactions via Alchemy RPC
- **Database**: PostgreSQL with `pg` driver
- **Telegram**: `node-telegram-bot-api` for bot functionality
- **Build**: TypeScript compiler (`tsc`)
- **Dev Tools**: `tsx` for development with hot reload
- **Deployment**: Railway.app with nixpacks builder

## Quick Commands

```bash
npm install          # Install dependencies
npm run dev          # Development mode with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run production build (node dist/bot.js)
npm run view-history # View recorded burns from database
npm run backfill     # Backfill historical burns (default: ethereum)
npm run backfill -- unichain  # Backfill for a specific chain
```

## Project Structure

```
src/
├── bot.ts              # Main entry point - multi-chain polling loop and orchestration
├── chainConfig.ts      # Chain registry with addresses, explorers, RPC config per chain
├── chainMonitor.ts     # Multi-chain blockchain monitoring with viem (log fetching)
├── config.ts           # Environment variable loading and validation
├── database.ts         # PostgreSQL operations (burns table with chain column, state table)
├── formatter.ts        # Telegram message templates (HTML format, dynamic explorer URLs, USD enrichment)
├── uniswapApi.ts       # Uniswap Trading API client with cached UNI/USD pricing
├── telegramService.ts  # Telegram Bot API wrapper and command handlers
├── types.ts            # TypeScript interfaces (BurnEvent, Config, DebugInfo, etc.)
├── backfillService.ts  # Historical burn import logic (chain-aware)
├── backfill.ts         # CLI script to import historical burns per chain
└── viewHistory.ts      # Utility script to view recorded burns
```

## Architecture

### Multi-Chain Design

- **Chain registry** (`chainConfig.ts`): Hardcoded `CHAIN_REGISTRY` map with per-chain config (RPC slug, token address, explorer, block limits, deployment block)
- **Single Alchemy API key**: Same key works across all Alchemy-supported chains via different URL subdomains
- **Sequential polling**: Chains are polled one at a time in the main loop to respect shared rate limits
- **Backwards-compatible**: With no `ENABLED_CHAINS` env var, only Ethereum is monitored (identical to pre-multi-chain behavior)
- **Per-chain state**: `lastProcessedBlock:${chainId}` keys in state table

### Supported Chains

| Chain | ID | Default | Status |
|-------|----|---------|--------|
| Ethereum | `ethereum` | Enabled | Active |
| Unichain | `unichain` | Disabled | Ready (opt-in) |
| Arbitrum | `arbitrum` | Disabled | Stub (pending governance) |
| Base | `base` | Disabled | Stub |
| OP Mainnet | `optimism` | Disabled | Stub |
| World Chain | `worldchain` | Disabled | Stub |
| Celo | `celo` | Disabled | Stub |
| Soneium | `soneium` | Disabled | Stub |
| X Layer | `xlayer` | Disabled | Stub |
| Zora | `zora` | Disabled | Stub |

### Data Flow

1. `bot.ts` starts polling loop at configurable interval (default 60s)
2. For each enabled chain, `chainMonitor.ts` fetches Transfer events from the chain's UNI token contract
3. Events to Firepit (`0x0D5Cd...`) or dead address (`0xdead...`) are detected
4. `database.ts` checks for duplicates (by tx_hash + chain) and stores new burns
5. `formatter.ts` creates HTML-formatted alert with dynamic explorer URLs
6. `telegramService.ts` sends alert to configured channel

### USD Price Enrichment

- **`uniswapApi.ts`**: Fetches UNI/USD price via Uniswap Trading API (`POST /quote`)
- Quotes 1000 UNI → USDC on Ethereum mainnet, derives per-UNI price
- In-memory cache with 5-minute TTL (well within 3 req/sec API limit)
- Graceful degradation: no API key = no USD values = alerts work as before
- USD values shown in burn alerts (`Amount: 4,231 UNI (~$16,308)`), `/stats`, and `/price`

### Database Schema

**burns table:**
- `tx_hash` (VARCHAR 66) - Transaction hash
- `block_number` (BIGINT) - Block number on source chain
- `timestamp` (BIGINT) - Unix timestamp
- `uni_amount` (TEXT) - Formatted UNI amount
- `uni_amount_raw` (TEXT) - Raw wei amount
- `burner` (VARCHAR 42) - Transaction initiator (tx.from)
- `transfer_from` (VARCHAR 42) - Transfer event's from address
- `destination` (VARCHAR 20) - "firepit" or "dead"
- `gas_used`, `gas_price` (TEXT) - Transaction gas data
- `chain` (VARCHAR 30, NOT NULL, DEFAULT 'ethereum') - Chain identifier
- UNIQUE constraint on `(tx_hash, chain)`

**state table:**
- Stores `lastProcessedBlock:${chainId}` for per-chain polling continuity

**Database indexes:**
- `idx_burns_tx_hash` - Fast duplicate checking
- `idx_burns_timestamp` - Recent burns queries
- `idx_burns_block_number` - Block range queries
- `idx_burns_burner` - Top initiators aggregation
- `idx_burns_chain` - Chain-filtered queries

**Migration safety:**
- Adding `chain` column is idempotent (checks if column exists first)
- Existing rows default to `chain='ethereum'`
- Old `lastProcessedBlock` state key migrated to `lastProcessedBlock:ethereum`

**Connection pool settings:**
- Max connections: 10
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds

### Key Constants

**Per-chain config (chainConfig.ts):**
- `blockTimeSeconds`: ~12 for Ethereum, ~2 for L2s, ~0.25 for Arbitrum
- `maxBlocksPerQuery`: 9n for Ethereum (Alchemy free tier), 1000n+ for L2s
- `deploymentBlock`: Chain-specific backfill start block
- Initial lookback calculated dynamically: `Math.ceil(7200 / blockTimeSeconds)` blocks (~2 hours)

**Backfill (backfillService.ts):**
- `DELAY_BETWEEN_CHUNKS_MS`: 100ms (rate limiting protection)
- Uses each chain's `maxBlocksPerQuery` and `deploymentBlock`

## Environment Variables

**Required:**
- `TELEGRAM_BOT_TOKEN` - From @BotFather
- `TELEGRAM_CHANNEL_ID` - Channel ID or @username
- `ALCHEMY_API_KEY` - RPC access (same key for all chains)
- `DATABASE_URL` or `POSTGRES_URL` - PostgreSQL connection string

**Optional:**
- `POLL_INTERVAL_SECONDS` (default: 60)
- `SITE_URL` (default: https://tokenjar.xyz)
- `AMOUNT_THRESHOLD` - Minimum burn amount for alerts (in wei, default: 4000 UNI)
- `ENABLED_CHAINS` - Comma-separated chain IDs (default: "ethereum")
- `UNISWAP_API_KEY` - Uniswap Trading API key for USD price enrichment
- `NODE_ENV` - Set to "production" for SSL database connections

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/stats` | Show comprehensive burn statistics (aggregate across all chains) with USD values |
| `/test` | Send test alert using last recorded burn |
| `/price` | Show current UNI/USD price from Uniswap Trading API |
| `/debug` | Show per-chain block info and technical config |

## Code Conventions

### TypeScript
- Strict mode enabled (`"strict": true`)
- Use `type` imports for type-only imports
- Explicit return types on exported functions
- Use `bigint` for block numbers and raw token amounts

### Formatting
- Telegram messages use HTML parse mode (`<b>`, `<a href="">`, `<code>`)
- Numbers formatted with `toLocaleString("en-US")` for readability
- Addresses shortened as `0x1234...abcd` in display
- Explorer URLs are dynamic per chain (via `getExplorerTxUrl()`, `getExplorerAddressUrl()`)

### Error Handling
- Console logging with `[Module]` or `[ChainName]` prefixes
- Graceful shutdown handlers for SIGINT/SIGTERM
- Database operations use connection pooling with timeouts

### Multi-Chain Patterns
- Use `ChainConfig` for all chain-specific values (addresses, decimals, block limits)
- Chain clients stored in a `Map<string, PublicClient>` in `chainMonitor.ts`
- Database functions accept optional `chain` param for filtering; omit for aggregates
- State keys namespaced by chain: `lastProcessedBlock:${chainId}`

## Testing Locally

1. Copy `.env.example` to `.env` and fill in values
2. Set up local PostgreSQL or use remote database
3. Run `npm run dev` for development with hot reload
4. Use `/test` command in Telegram to verify bot works
5. To test multi-chain: set `ENABLED_CHAINS=ethereum,unichain`

## Deployment Notes

- Railway.app auto-provides `DATABASE_URL` from PostgreSQL addon
- `railway.toml` configuration:
  - Builder: nixpacks
  - Build: `npm install && npm run build`
  - Start: `npm start`
  - Restart policy: on_failure (max 10 retries)
- Bot sends startup message listing monitored chains when initialized
- Set `NODE_ENV=production` for SSL database connections
- To enable new chains: add chain ID to `ENABLED_CHAINS` env var in Railway

## Common Tasks

### Adding a New Chain
1. Add entry to `CHAIN_REGISTRY` in `chainConfig.ts` with correct addresses, explorer, deployment block
2. Set `enabled: false` for opt-in (or `true` for default-on)
3. Deploy and set `ENABLED_CHAINS` to include the new chain
4. Run `npm run backfill -- <chain-id>` for historical data

### Adding a New Bot Command
1. Add handler in `telegramService.ts` using `bot.onText()`
2. Create formatter function in `formatter.ts` if needed
3. Register callback in `bot.ts` if it needs database access

### Modifying Alert Format
- Edit `formatBurnAlert()` in `formatter.ts`
- Use HTML tags for Telegram formatting
- Use `getExplorerTxUrl(chain, txHash)` for dynamic explorer links

### Adding Database Fields
1. Update `runMigrations()` in `database.ts` with ALTER TABLE (idempotent check)
2. Update `StoredBurn` interface in `types.ts`
3. Update `saveBurn()` and `mapRowToStoredBurn()` in `database.ts`

## Important Notes

- The bot uses polling (not webhooks) for simplicity
- Alchemy free tier has a 10-block limit per `getLogs` query on Ethereum mainnet; L2s have higher limits
- Burns are deduplicated by (tx_hash, chain) in the database (composite UNIQUE + ON CONFLICT DO NOTHING)
- The Ethereum backfill starts from Firepit deployment (block 24028203, December 16, 2025)
- First UNI transfers to Firepit occurred at block 24116850 (December 29, 2025)
- Chains are polled sequentially to respect shared Alchemy rate limits

## Key Interfaces (types.ts)

| Interface | Purpose |
|-----------|---------|
| `TransferEvent` | Raw ERC-20 Transfer event from viem |
| `BurnEvent` | Processed burn with initiator, metadata, and chain |
| `StoredBurn` | Database row representation (includes chain) |
| `BurnStats` | Basic statistics (total, count, last timestamp) |
| `ExtendedBurnStats` | Full stats with top initiators and averages |
| `TopInitiator` | Address and transaction count for leaderboard |
| `Config` | Environment configuration (includes enabledChains) |
| `DebugInfo` | Multi-chain debug info with per-chain block status |
| `ChainDebugInfo` | Per-chain block/processing status |

## Chain Config Interface (chainConfig.ts)

| Field | Purpose |
|-------|---------|
| `id` | Unique chain identifier (e.g., "ethereum") |
| `name` | Display name (e.g., "Ethereum") |
| `viemChain` | viem Chain object for client creation |
| `alchemySlug` | Alchemy URL subdomain (e.g., "eth-mainnet") |
| `tokenAddress` | UNI token contract on this chain |
| `firepitAddress` | Firepit/releaser contract |
| `explorerUrl` / `explorerName` | Block explorer for links |
| `deploymentBlock` | Backfill start block |
| `blockTimeSeconds` | For lookback estimation |
| `maxBlocksPerQuery` | RPC log query limit |
| `enabled` | Default enable state |

## Database Functions (database.ts)

| Function | Purpose |
|----------|---------|
| `initDatabase()` | Connect to PostgreSQL and run migrations |
| `isBurnNotified(txHash, chain)` | Check if burn exists for tx+chain |
| `saveBurn()` | Insert burn with ON CONFLICT (tx_hash, chain) DO NOTHING |
| `getBurnStats(chain?)` | Get stats, optionally filtered by chain |
| `getExtendedBurnStats(chain?)` | Get full stats with optional chain filter |
| `getRecentBurns()` | Get N most recent burns across all chains |
| `getLastBurn()` | Get single most recent burn |
| `getTopInitiators(limit, chain?)` | Get leaderboard, optionally by chain |
| `getLastProcessedBlock(chain)` | Get per-chain polling checkpoint |
| `setLastProcessedBlock(block, chain)` | Update per-chain polling checkpoint |
