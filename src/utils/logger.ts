import { appendFileSync, existsSync, readFileSync } from "fs";
import { env } from "../env";

const LOG_FILE = env.LOG_FILE_PATH;

function write(level: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const line = `${ts} [${level}] ${msg}\n`;

  console.log(line.trimEnd());

  try {
    appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    /* silently fail if file is unwritable */
  }
}

export const logger = {
  log: (...args: unknown[]) => write("LOG", ...args),
  error: (...args: unknown[]) => write("ERROR", ...args),
  warn: (...args: unknown[]) => write("WARN", ...args),
};

const SIXTY_MIN = 60 * 60 * 1000;

export function readRecentLogs(): string {
  try {
    if (!existsSync(LOG_FILE)) return "No logs yet.";

    const raw = readFileSync(LOG_FILE, "utf-8");
    if (!raw.trim()) return "No logs yet.";

    const cutoff = Date.now() - SIXTY_MIN;
    const lines = raw.trim().split("\n").filter((line) => {
      const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
      if (!match) return false;
      return new Date(match[1]!).getTime() >= cutoff;
    });

    if (lines.length === 0) return "No logs in the last 60 minutes.";

    return lines.reverse().join("\n");
  } catch {
    return "Failed to read logs.";
  }
}
