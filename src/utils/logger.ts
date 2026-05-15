/*
  Simple conditional logger.
  Only prints messages when NODE_ENV is set to "dev" or "development".
  In production, all log output is suppressed to avoid noise and
  prevent accidentally leaking info in server logs.
*/

const IS_DEV =
  process.env.NODE_ENV === "dev" || process.env.NODE_ENV === "development";

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
