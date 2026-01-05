# UNI Burn Telegram Bot

A Telegram bot that monitors UNI token burns on Ethereum and sends alerts to a public channel.

## Features

- 🔥 **Real-time burn alerts** - Monitors transfers to Firepit and 0xdead addresses
- 📊 **Running totals** - Shows cumulative burn statistics
- 🔗 **Etherscan links** - Direct links to transactions
- 💾 **SQLite persistence** - Prevents duplicate notifications
- 🚀 **Railway-ready** - Easy deployment with included config

## Prerequisites

1. **Telegram Bot Token** - Create a bot via [@BotFather](https://t.me/botfather)
2. **Telegram Channel** - Create a public channel and add your bot as admin
3. **Alchemy API Key** - Get a free key at [alchemy.com](https://www.alchemy.com/)

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

# Optional
POLL_INTERVAL_SECONDS=60
SITE_URL=https://your-tokenjar-site.com
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

## Deployment on Railway

1. Push your code to GitHub
2. Create a new project on [Railway](https://railway.app/)
3. Connect your GitHub repo
4. Add environment variables in Railway dashboard:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHANNEL_ID`
   - `ALCHEMY_API_KEY`
   - `SITE_URL` (optional)
5. Deploy!

The `railway.toml` file handles build and start commands automatically.

## Project Structure

```
src/
├── bot.ts              # Main entry point, polling loop
├── config.ts           # Environment configuration
├── database.ts         # SQLite operations
├── ethereumMonitor.ts  # Blockchain monitoring with viem
├── formatter.ts        # Message templates
├── telegramService.ts  # Telegram Bot API
├── types.ts            # TypeScript interfaces
└── viewHistory.ts      # Utility to view recorded burns
```

## Message Format

When a burn is detected, the bot sends:

```
🔥 UNI BURN DETECTED 🔥

Amount: 4,000 UNI
Destination: 🏺 Firepit
Burner: 0x1234...abcd
Time: Jan 5, 2026, 7:00 AM PST

📊 Running Total: 156,000 UNI (42 burns)

🔗 View Transaction
📈 Track TokenJar
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | - | Bot token from @BotFather |
| `TELEGRAM_CHANNEL_ID` | Yes | - | Channel ID (e.g., `@channel_name` or `-1001234567890`) |
| `ALCHEMY_API_KEY` | Yes | - | Alchemy API key for Ethereum RPC |
| `POLL_INTERVAL_SECONDS` | No | `60` | How often to check for new burns |
| `SITE_URL` | No | `https://tokenjar.xyz` | Your TokenJar monitor site |
| `TOKEN_ADDRESS` | No | UNI address | ERC-20 token to monitor |
| `FIREPIT_ADDRESS` | No | Firepit address | First burn destination |
| `BURN_ADDRESS` | No | 0xdead | Second burn destination |

## License

MIT
