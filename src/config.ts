/*
  Central configuration module.
  Reads all environment variables at startup and exports them as a typed config object.
  If required keys are missing, the bot will log an error and exit early.
*/

export const config = {
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || "",
    baseUrl: "https://openrouter.ai/api/v1",
    model: process.env.LLM_MODEL || "minimax/minimax-m2.5:free",
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  },
  cricketApi: {
    apiKey: process.env.CRICAPI_KEY || "",
    baseUrl: "https://api.cricapi.com/v1",
  },
  session: {
    maxMessages: 20,
  },
  mongo: {
    uri: process.env.MONGO_URI || "",
    dbName: "ipl_win_prediction",
  },
  http: {
    port: parseInt(process.env.PORT || "8080", 10),
  },
  firecrawl: {
    apiKey: process.env.FIRECRAWL_API_KEY || "",
    baseUrl: "https://api.firecrawl.dev",
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  if (!config.telegram.botToken) errors.push("TELEGRAM_BOT_TOKEN is not set");
  if (!config.openRouter.apiKey) errors.push("OPENROUTER_API_KEY is not set");
  if (!config.mongo.uri) errors.push("MONGO_URI is not set");
  if (!config.cricketApi.apiKey) errors.push("CRICAPI_KEY is not set");
  return errors;
}
