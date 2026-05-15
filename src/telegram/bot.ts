/*
  Telegram bot setup using the Grammy framework.
  Grammy is chosen over Telegraf because:
    - Modern TypeScript-native design
    - Better error handling
    - Active maintenance
    - Clean middleware API

  The bot:
    1. Listens for /start and /reset commands
    2. Treats all other messages as questions for the LLM
    3. Passes each message through the tool-calling LLM loop
    4. Streams the response back to the user
*/

import { Bot, GrammyError, HttpError } from "grammy";
import { config, validateConfig } from "../config";
import { chatLoop } from "../utils/llm";
import { logger } from "../utils/logger";
import { toolDefinitions } from "../tools/definitions";
import { executeTool } from "../tools/handlers";
import { SessionManager } from "./session";

/*
  Validate required env vars before starting the bot.
  Early exit if anything is missing; avoids cryptic runtime errors.
*/
const configErrors = validateConfig();
if (configErrors.length > 0) {
  logger.error("Configuration errors:");
  for (const err of configErrors) {
    logger.error(`  - ${err}`);
  }
  logger.error("\nPlease set the missing environment variables and restart.");
  process.exit(1);
}

const bot = new Bot(config.telegram.botToken);
const sessions = new SessionManager();

/*
  Track total API hits used across all sessions.
  Reset on bot restart, but gives a rough idea of usage.
*/
let totalApiHits = 0;

/*
  /start command: welcome message with instructions.
*/
bot.command("start", async (ctx) => {
  sessions.resetChat(ctx.chat.id);
  await ctx.reply(
    "🏏 *IPL Qualification Path Analyzer* 🏏\n\n" +
    "Ask me anything about IPL team qualification chances!\n\n" +
    "Examples:\n" +
    "• *Can RCB still qualify for the playoffs?*\n" +
    "• *What are CSK's remaining matches?*\n" +
    "• *How many points does MI need to qualify?*\n" +
    "• *Show me the current standings*\n\n" +
    "I can see matches from the last ~7 days and next ~7 days.\n" +
    "Type /reset to start a fresh conversation.",
    { parse_mode: "Markdown" },
  );
});

/*
  /reset command: clear conversation history for this chat.
*/
bot.command("reset", async (ctx) => {
  sessions.resetChat(ctx.chat.id);
  await ctx.reply("Conversation reset. Ask me a new question!");
});

/*
  Message handler: text messages (not commands) are treated as questions.
  We show a typing indicator while the LLM processes the request
  to let the user know something is happening.
*/
bot.on("message:text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userText = ctx.message.text;

  /*
    Show typing indicator. Grammy sends this automatically
    and Telegram shows "bot is typing..." to the user.
    We need to hold the context open while processing.
  */
  await ctx.api.sendChatAction(chatId, "typing");

  /*
    Add the user's message to the session history.
  */
  sessions.addMessage(chatId, {
    role: "user",
    content: userText,
  });

  try {
    const messages = sessions.getMessages(chatId);

    /*
      Track tool calls for the API usage message.
    */
    let toolCallCount = 0;

    const response = await chatLoop(
      messages,
      toolDefinitions,
      async (name, args) => {
        toolCallCount++;
        totalApiHits++;
        return executeTool(name, args);
      },
    );

    /*
      Add the assistant's response to the session history.
    */
    sessions.addMessage(chatId, {
      role: "assistant",
      content: response,
    });

    const usageNote =
      toolCallCount > 0
        ? `\n\n_Used ${toolCallCount} data fetch${toolCallCount > 1 ? "es" : ""}._`
        : "";

    await ctx.reply(response + usageNote, { parse_mode: "Markdown" });
  } catch (error) {
    logger.error(`Error processing chat ${chatId}:`, error);

    /*
      Provide a user-friendly error message.
      The bot should never crash from a user message.
    */
    const errorMessage =
      "Sorry, something went wrong while processing your request. " +
      "Please try again or type /reset to start over.";

    await ctx.reply(errorMessage);
  }
});

/*
  Global error handler for Grammy.
  Catches errors that would otherwise crash the bot process.
  Without this, one bad message could take down the entire bot.
*/
bot.catch((err) => {
  const ctx = err.ctx;
  logger.error(`Error for chat ${ctx?.chat?.id ?? "unknown"}:`);

  if (err.error instanceof GrammyError) {
    logger.error(`  Grammy error: ${err.error.description}`);
  } else if (err.error instanceof HttpError) {
    logger.error(`  HTTP error: ${err.error}`);
  } else {
    logger.error(`  Unknown error: ${err.error}`);
  }
});

/*
  Start the bot with long polling.
  No webhook needed for development / small-scale usage.
*/
export async function startBot(): Promise<void> {
  logger.log("Starting IPL Qualification Path Analyzer bot...");
  logger.log(`  Model: ${config.openRouter.model}`);
  logger.log("  Polling for updates... (Ctrl+C to stop)");

  bot.start({
    onStart: (botInfo) => {
      logger.log(`  Bot @${botInfo.username} is now running!`);
    },
  });
}
