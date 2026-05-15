import { env } from "./env";

export const config = {
  openRouter: {
    apiKey: env.openRouterApiKey,
    baseUrl: "https://openrouter.ai/api/v1",
    model: env.llmModel,
  },
  telegram: {
    botToken: env.telegramBotToken,
  },
  cricketApi: {
    apiKey: env.cricApiKey,
    baseUrl: "https://api.cricapi.com/v1",
  },
  session: {
    maxMessages: 20,
  },
  mongo: {
    uri: env.mongoUri,
    dbName: "ipl_win_prediction",
  },
  http: {
    port: parseInt(env.port, 10),
  },
  firecrawl: {
    apiKey: env.firecrawlApiKey,
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
