# UNI Burn Telegram Bot

A Telegram bot that monitors UNI token burns on Ethereum and sends alerts to a public channel.

## Features

- 🔥 **Real-time burn alerts** - Monitors transfers to Firepit and 0xdead addresses
- 📊 **Running totals** - Shows cumulative burn statistics
- 🔗 **Etherscan links** - Direct links to transactions
- 💾 **PostgreSQL persistence** - Prevents duplicate notifications
- 🤖 **Bot commands** - /stats, /test, and /debug for interactive use
- 🚀 **Railway-ready** - Easy deployment with included config

## Prerequisites

1. **Telegram Bot Token** - Create a bot via [@BotFather](https://t.me/botfather)
2. **Telegram Channel** - Create a public channel and add your bot as admin
3. **Alchemy API Key** - Get a free key at [alchemy.com](https://www.alchemy.com/)
4. **PostgreSQL Database** - Local instance or hosted (Railway provides this)

## Setup

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/uni-burn-telegram-bot.git
cd uni-burn-telegram-bot
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHANNEL_ID=@your_channel_name
ALCHEMY_API_KEY=your_alchemy_api_key
DATABASE_URL=postgresql://user:password@localhost:5432/uniburn

# Optional
POLL_INTERVAL_SECONDS=60
```

### 3. Run Locally

Development mode (with hot reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

### 4. View History

To see recorded burns:
```bash
npm run view-history
```

## Bot Commands

The bot responds to the following commands in Telegram:

| Command | Description |
|---------|-------------|
| `/stats` | Shows comprehensive burn statistics including total burned, burn count, top searchers, and average time between burns |
| `/test` | Sends a test alert using the last recorded burn from the database |
| `/debug` | Shows technical debugging info (current block, last processed block, configuration) |

## Deployment on Railway

1. Push your code to GitHub
2. Create a new project on [Railway](https://railway.app/)
3. Connect your GitHub repo
4. Add a PostgreSQL database service to your project
5. Add environment variables in Railway dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHANNEL_ID`
   - `ALCHEMY_API_KEY`
   - Note: Railway automatically provides `DATABASE_URL` from the PostgreSQL service
6. Deploy!

The `railway.toml` file handles build and start commands automatically.

## Project Structure

```
src/
├── bot.ts              # Main entry point, polling loop
├── config.ts           # Environment configuration
├── database.ts         # PostgreSQL operations
├── ethereumMonitor.ts  # Blockchain monitoring with viem
├── formatter.ts        # Message templates
├── telegramService.ts  # Telegram Bot API
├── types.ts            # TypeScript interfaces
└── viewHistory.ts      # Utility to view recorded burns
```

## Message Format

When a burn is detected, the bot sends:

```
🔥 UNI Burn Detected

📁 Latest Burn
Searcher: 0x1234...abcd
Transaction: 0xabc123...
Amount: 4,000 UNI

Time Since Last Burn: 2h 15m

📊 Aggregate Statistics
Total UNI Burned: 156,000 UNI
Total Burns: 42
Average Time Between: 1h 30m
Unique Searchers: 12

Top Searchers:
🥇 0x1234abcd... - 15 burns
🥈 0x5678efgh... - 10 burns
🥉 0x9012ijkl... - 8 burns

💎 View on Etherscan
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token from @BotFather |
| `TELEGRAM_CHANNEL_ID` | Yes | - | Channel ID (e.g., `@channel_name` or `-1001234567890`) |
| `ALCHEMY_API_KEY` | Yes | - | Alchemy API key for Ethereum RPC |
| `DATABASE_URL` | Yes | - | PostgreSQL connection string (or `POSTGRES_URL`) |
| `POLL_INTERVAL_SECONDS` | No | `60` | How often to check for new burns |
| `TOKEN_ADDRESS` | No | UNI address | ERC-20 token to monitor |
| `TOKEN_DECIMALS` | No | `18` | Token decimal precision |
| `FIREPIT_ADDRESS` | No | Firepit address | First burn destination |
| `BURN_ADDRESS` | No | 0xdead | Second burn destination |
| `AMOUNT_THRESHOLD` | No | 4000 UNI (in wei) | Minimum burn amount to trigger alert |
| `NODE_ENV` | No | - | Set to `production` for SSL database connections |

## Changelog

### v1.1.0
- **Database**: Migrated from SQLite to PostgreSQL for persistent storage
- **Commands**: Added `/stats`, `/test`, and `/debug` bot commands
- **Stats**: Added top searchers, unique searcher count, and average time between burns
- **Alerts**: Updated message format with detailed aggregate statistics

### v1.0.0
- Initial release with real-time burn monitoring and Telegram alerts

## License

MIT
