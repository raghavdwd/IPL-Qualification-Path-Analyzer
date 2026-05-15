/*
  Entry point for the IPL Qualification Path Analyzer Telegram bot.

  This file:
    1. Loads environment variables (Bun loads .env automatically)
    2. Starts the Grammy bot with long polling
    3. Sets up graceful shutdown so the bot stops cleanly

  Usage:
    bun run index.ts
*/

import { logger } from "./src/utils/logger";
import { startBot } from "./src/telegram/bot";

/*
  Graceful shutdown handler.
  When the user presses Ctrl+C, we log a message and exit cleanly.
  Without this, the bot would just crash with no visible message.
*/
process.on("SIGINT", () => {
  logger.log("\nShutting down bot...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.log("\nShutting down bot...");
  process.exit(0);
});

/*
  Start the bot. The startBot function handles the rest.
  If it throws during initialization, we log the error and exit.
*/
startBot().catch((error) => {
  logger.error("Failed to start bot:", error);
  process.exit(1);
});
