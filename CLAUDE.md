# CLAUDE.md - AI Assistant Guide

This document provides essential context for AI assistants working with the UNI Burn Telegram Bot codebase.

## Project Overview

A Telegram bot that monitors UNI token burns on Ethereum mainnet and sends real-time alerts to a Telegram channel. The bot tracks transfers to the Firepit contract and the 0xdead burn address, stores burn events in PostgreSQL, and provides statistics via bot commands.

## Tech Stack

- **Runtime**: Node.js (>=18.0.0)
- **Language**: TypeScript (ES2022, strict mode)
- **Blockchain**: [viem](https://viem.sh/) for Ethereum interactions via Alchemy RPC
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
npm run backfill     # Backfill historical burns from blockchain
```

## Project Structure

```
src/
├── bot.ts              # Main entry point - polling loop and orchestration
├── config.ts           # Environment variable loading and validation
├── database.ts         # PostgreSQL operations (burns table, state table)
├── ethereumMonitor.ts  # Blockchain monitoring with viem (log fetching)
├── formatter.ts        # Telegram message templates (HTML format)
├── telegramService.ts  # Telegram Bot API wrapper and command handlers
├── types.ts            # TypeScript interfaces (BurnEvent, Config, etc.)
├── viewHistory.ts      # Utility script to view recorded burns
└── backfill.ts         # One-time script to import historical burns
```

## Architecture

### Data Flow

1. `bot.ts` starts polling loop at configurable interval (default 60s)
2. `ethereumMonitor.ts` fetches Transfer events from UNI token contract
3. Events to Firepit (`0x0D5Cd...`) or dead address (`0xdead...`) are detected
4. `database.ts` checks for duplicates and stores new burns
5. `formatter.ts` creates HTML-formatted alert message
6. `telegramService.ts` sends alert to configured channel

### Database Schema

**burns table:**
- `tx_hash` (VARCHAR 66, UNIQUE) - Transaction hash
- `block_number` (BIGINT) - Ethereum block number
- `timestamp` (BIGINT) - Unix timestamp
- `uni_amount` (TEXT) - Formatted UNI amount
- `uni_amount_raw` (TEXT) - Raw wei amount
- `burner` (VARCHAR 42) - Transaction initiator (tx.from)
- `transfer_from` (VARCHAR 42) - Transfer event's from address
- `destination` (VARCHAR 20) - "firepit" or "dead"
- `gas_used`, `gas_price` (TEXT) - Transaction gas data

**state table:**
- Stores `lastProcessedBlock` for polling continuity

**Database indexes:**
- `idx_burns_tx_hash` - Fast duplicate checking
- `idx_burns_timestamp` - Recent burns queries
- `idx_burns_block_number` - Block range queries
- `idx_burns_burner` - Top initiators aggregation

**Connection pool settings:**
- Max connections: 10
- Idle timeout: 30 seconds
- Connection timeout: 10 seconds

### Key Constants

**Polling (bot.ts/ethereumMonitor.ts):**
- `INITIAL_LOOKBACK_BLOCKS`: 600n (~2 hours at 12s/block)
- `MAX_BLOCKS_PER_QUERY`: 9n (Alchemy free tier limit: 10 blocks inclusive, uses n-1 for safety)
- Default poll interval: 60 seconds
- Default burn threshold: 4000 UNI (in wei: `4000000000000000000000`)

**Backfill (backfill.ts):**
- `FIREPIT_DEPLOYMENT_BLOCK`: 24028203n (December 16, 2025)
- `MAX_BLOCKS_PER_QUERY`: 10n (full Alchemy limit for historical scans)
- `DELAY_BETWEEN_CHUNKS_MS`: 100ms (rate limiting protection)

## Environment Variables

**Required:**
- `TELEGRAM_BOT_TOKEN` - From @BotFather
- `TELEGRAM_CHANNEL_ID` - Channel ID or @username
- `ALCHEMY_API_KEY` - Ethereum RPC access
- `DATABASE_URL` or `POSTGRES_URL` - PostgreSQL connection string

**Optional:**
- `POLL_INTERVAL_SECONDS` (default: 60)
- `SITE_URL` (default: https://tokenjar.xyz)
- `TOKEN_ADDRESS` (default: UNI token `0x1f9840a85d5af5bf1d1762f925bdaddc4201f984`)
- `TOKEN_DECIMALS` (default: 18)
- `FIREPIT_ADDRESS` (default: `0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721`)
- `BURN_ADDRESS` (default: `0x000000000000000000000000000000000000dEaD`)
- `AMOUNT_THRESHOLD` - Minimum burn amount for alerts (in wei, default: 4000 UNI)
- `NODE_ENV` - Set to "production" for SSL database connections

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/stats` | Show comprehensive burn statistics |
| `/test` | Send test alert using last recorded burn |
| `/debug` | Show technical info (blocks, config) |

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

### Error Handling
- Console logging with `[Module]` prefixes (e.g., `[Bot]`, `[Telegram]`)
- Graceful shutdown handlers for SIGINT/SIGTERM
- Database operations use connection pooling with timeouts

### Ethereum Patterns
- Use `getAddress()` from viem for address checksumming
- Fetch logs in chunks to respect Alchemy limits
- Store both formatted amounts (`uniAmount`) and raw wei (`uniAmountRaw`)
- Track both `initiator` (tx.from) and `transferFrom` (event source)

## Testing Locally

1. Copy `.env.example` to `.env` and fill in values
2. Set up local PostgreSQL or use remote database
3. Run `npm run dev` for development with hot reload
4. Use `/test` command in Telegram to verify bot works

## Deployment Notes

- Railway.app auto-provides `DATABASE_URL` from PostgreSQL addon
- `railway.toml` configuration:
  - Builder: nixpacks
  - Build: `npm install && npm run build`
  - Start: `npm start`
  - Restart policy: on_failure (max 10 retries)
- Bot sends startup message to the configured channel when initialized
- Set `NODE_ENV=production` for SSL database connections

## Common Tasks

### Adding a New Bot Command
1. Add handler in `telegramService.ts` using `bot.onText()`
2. Create formatter function in `formatter.ts` if needed
3. Register callback in `bot.ts` if it needs database access

### Modifying Alert Format
- Edit `formatBurnAlert()` in `formatter.ts`
- Use HTML tags for Telegram formatting
- Include Etherscan links for transactions and addresses

### Adding Database Fields
1. Update `runMigrations()` in `database.ts` with ALTER TABLE
2. Update `StoredBurn` interface in `types.ts`
3. Update `saveBurn()` and `mapRowToStoredBurn()` in `database.ts`

### Changing Monitored Token
- Set `TOKEN_ADDRESS`, `TOKEN_DECIMALS` in environment
- Modify `FIREPIT_ADDRESS`, `BURN_ADDRESS` as needed
- Re-run backfill if historical data needed

## Important Notes

- The bot uses polling (not webhooks) for simplicity
- Alchemy free tier has a 10-block limit per `getLogs` query
- Burns are deduplicated by transaction hash in the database (UNIQUE constraint + ON CONFLICT DO NOTHING)
- The backfill script starts from Firepit deployment (block 24028203, December 16, 2025)
- First UNI transfers to Firepit occurred at block 24116850 (December 29, 2025)

## Key Interfaces (types.ts)

| Interface | Purpose |
|-----------|---------|
| `TransferEvent` | Raw ERC-20 Transfer event from viem |
| `BurnEvent` | Processed burn with initiator and metadata |
| `StoredBurn` | Database row representation |
| `BurnStats` | Basic statistics (total, count, last timestamp) |
| `ExtendedBurnStats` | Full stats with top initiators and averages |
| `TopInitiator` | Address and transaction count for leaderboard |
| `Config` | All environment configuration values |
| `DebugInfo` | Technical info for /debug command |

## Formatter Functions (formatter.ts)

| Function | Purpose |
|----------|---------|
| `formatBurnAlert()` | Main burn notification with stats and links |
| `formatThresholdAlert()` | Alert when approaching burn threshold |
| `formatStartupMessage()` | Bot online notification |
| `formatErrorMessage()` | Error notification template |

## Database Functions (database.ts)

| Function | Purpose |
|----------|---------|
| `initDatabase()` | Connect to PostgreSQL and run migrations |
| `isBurnNotified()` | Check if tx_hash already exists |
| `saveBurn()` | Insert burn with ON CONFLICT DO NOTHING |
| `getBurnStats()` | Get basic statistics |
| `getExtendedBurnStats()` | Get full statistics for alerts |
| `getRecentBurns()` | Get N most recent burns |
| `getLastBurn()` | Get single most recent burn |
| `getTopInitiators()` | Get leaderboard by transaction count |
| `getLastProcessedBlock()` | Get polling checkpoint |
| `setLastProcessedBlock()` | Update polling checkpoint |
