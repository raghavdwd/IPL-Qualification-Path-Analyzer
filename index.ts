/*
  Entry point for the IPL Qualification Path Analyzer Telegram bot.

  This file:
    1. Loads environment variables (Bun loads .env automatically)
    2. Starts a lightweight HTTP server for Render health checks
    3. Starts the Grammy bot with MongoDB-backed sessions
    4. Sets up graceful shutdown so connections close cleanly

  Usage:
    bun run index.ts
*/

import { logger } from "./src/utils/logger";
import { startHttpServer } from "./src/http";
import { startBot, disconnectDb } from "./src/telegram/bot";

/*
  Graceful shutdown handler.
  Closes the MongoDB connection before exiting so we don't
  leave hanging connections on the database server.
*/
async function shutdown(): Promise<void> {
  logger.log("\nShutting down bot...");
  await disconnectDb();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

/*
  Start both servers:
    - HTTP server for Render health checks (this must bind first so Render knows we're up)
    - Telegram bot with long polling
*/
startHttpServer();

startBot().catch((error) => {
  logger.error("Failed to start bot:", error);
  process.exit(1);
});
