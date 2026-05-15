import { env } from "../env";

const IS_DEV = env.nodeEnv === "dev" || env.nodeEnv === "development";

export const logger = {
  log: (...args: unknown[]) => {
    if (IS_DEV) console.log(...args);
  },
  error: (...args: unknown[]) => {
    if (IS_DEV) console.error(...args);
  },
  warn: (...args: unknown[]) => {
    if (IS_DEV) console.warn(...args);
  },
};
