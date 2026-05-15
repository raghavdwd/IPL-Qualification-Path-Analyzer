# IPL Qualification Path Analyzer

Telegram bot that answers cricket fans' questions about IPL team qualification chances. Uses an LLM with live cricket data tools to calculate points, analyze net run rates, and explain exactly what each team needs to qualify.

## How It Works

```
User message → Grammy bot → LLM (tool-calling loop) → Cricket API / Web search → Reply
```

The bot uses an LLM agent loop: the model decides which tools to call (cricket scores, cached data, web search), processes the results, and continues until it has enough context to answer. Conversation history is persisted in MongoDB so it survives restarts.

**Components:**

- **`src/utils/llm.ts`** — OpenAI SDK client (OpenRouter-compatible) with a tool-calling loop. Sends messages + tool definitions to the LLM, executes requested tools, feeds results back, and repeats until a text response is ready.
- **`src/tools/definitions.ts`** — Tool schemas in OpenAI function-calling format. Defines what each tool does and what arguments it expects.
- **`src/tools/handlers.ts`** — Tool implementations. Fetches cricket data from CricAPI, manages the local match cache, and searches the web via Firecrawl.
- **`src/telegram/bot.ts`** — Grammy bot wiring. Handles `/start`, `/reset`, and text messages.
- **`src/telegram/session.ts`** — MongoDB-backed conversation session manager. Prunes old messages to stay within context limits.
- **`src/utils/cache.ts`** — Local file-based match cache. The free cricket API only returns ±7 days of data, so every fetch is saved to `data/matches.json`. Over time it accumulates the full season.
- **`src/utils/cricketApi.ts`** — Generic HTTP client for cricketdata.org.
- **`src/http.ts`** — Minimal HTTP server for Render health checks.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- MongoDB instance (local or Atlas)
- API keys (see below)

## Setup

```bash
git clone https://github.com/raghavdwd/IPL-Qualification-Path-Analyzer.git
cd IPL-Qualification-Path-Analyzer
bun install
cp .env.example .env
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Bot token from [@BotFather](https://t.me/BotFather) |
| `OPENROUTER_API_KEY` | Yes | — | OpenRouter API key (or any OpenAI-compatible provider) |
| `MONGO_URI` | Yes | — | MongoDB connection string |
| `FIRECRAWL_API_KEY` | Yes | — | Firecrawl API key for web search |
| `CRICAPI_KEY` | No | — | Cricket API key from [cricketdata.org](https://cricketdata.org) |
| `LLM_MODEL` | No | `minimax/minimax-m2.5:free` | Model to use (any OpenRouter or OpenAI model) |
| `PORT` | No | `8080` | HTTP server port (used by Render) |

## Running

```bash
bun run index.ts
```

The bot starts long-polling Telegram. Send `/start` to a chat to begin.

## Available Commands

- `/start` — Welcome message with instructions
- `/reset` — Clear conversation history and start fresh

## LLM Tools

The model can invoke these tools during a conversation:

| Tool | Purpose |
|---|---|
| `get_cric_score` | Fetch live scores, recent results, and upcoming fixtures (±7 days) |
| `get_cached_results` | Return all matches accumulated in the local cache (grows over time) |
| `get_match_detail` | Full scorecard for a specific match (live or recent) |
| `search_series` | Search for cricket series/tournaments by name |
| `web_search` | Real-time web search via Firecrawl (standings, NRR, news) |

The system prompt instructs the LLM to call `get_cached_results` first to see the full match history, then `get_cric_score` for the latest data, and `web_search` for points tables and NRR.

## Deployment

### Docker

```bash
docker build -t ipl-bot .
docker run -d --env-file .env ipl-bot
```

### Render

1. Create a new Web Service on Render
2. Connect your repository
3. Set the start command: `bun run index.ts`
4. Add all environment variables from `.env.example`
5. Render automatically hits `/health` to monitor the service

## Project Structure

```
src/
├── http.ts               # Health check HTTP server
├── config.ts             # Environment variable config
├── telegram/
│   ├── bot.ts            # Grammy bot setup and handlers
│   └── session.ts        # MongoDB session manager
├── tools/
│   ├── definitions.ts    # Tool schemas (OpenAI function-calling format)
│   └── handlers.ts       # Tool implementations
└── utils/
    ├── llm.ts            # OpenAI SDK client + tool-calling loop
    ├── cricketApi.ts     # CricAPI HTTP client
    ├── cache.ts          # Local file-based match cache
    ├── db.ts             # Mongoose models and connection
    └── logger.ts         # Simple logging utility
```
