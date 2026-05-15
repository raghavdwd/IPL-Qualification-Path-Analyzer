export const env = {
  openRouterApiKey: Bun.env.OPENROUTER_API_KEY || "",
  llmModel: Bun.env.LLM_MODEL || "minimax/minimax-m2.5:free",
  telegramBotToken: Bun.env.TELEGRAM_BOT_TOKEN || "",
  cricApiKey: Bun.env.CRICAPI_KEY || "",
  mongoUri: Bun.env.MONGO_URI || "",
  port: Bun.env.PORT || "8080",
  firecrawlApiKey: Bun.env.FIRECRAWL_API_KEY || "",
  nodeEnv: Bun.env.NODE_ENV || "",
  LOG_FILE_PATH: Bun.env.LOG_FILE_PATH || "logs/app.log",
};
