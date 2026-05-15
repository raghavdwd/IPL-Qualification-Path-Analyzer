/*
  Minimal HTTP server for Render health checks.
  Render requires a web service to bind to a port and respond to requests.
  Without this, Render would kill the container thinking it failed to start.

  Endpoints:
    GET /           — simple HTML landing page
    GET /health     — JSON health check (used by Render's health monitoring)
    GET /app/logs   — recent logs (last 60 min, newest first)
*/

import { config } from "./config";
import { logger, readRecentLogs } from "./utils/logger";

const START_TIME = Date.now();

const HEALTH_JSON = () =>
  JSON.stringify({
    status: "ok",
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  });

const LANDING_HTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IPL Win Prediction Bot</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
    h1 { color: #2563eb; }
    .status { color: #16a34a; font-weight: bold; }
  </style>
</head>
<body>
  <h1>🏏 IPL Qualification Path Analyzer</h1>
  <p class="status">Bot is running</p>
  <p>This is the health endpoint for the Telegram bot.</p>
  <p>To interact with the bot, open Telegram and send a message.</p>
  <p><small>Uptime: ${Math.floor((Date.now() - START_TIME) / 1000)}s</small></p>
</body>
</html>`;

const LOGS_HTML = () => {
  const lines = readRecentLogs();
  const rows = lines === "No logs yet." || lines === "No logs in the last 60 minutes." || lines === "Failed to read logs."
    ? `<p style="color: #888;">${lines}</p>`
    : `<pre style="font-size: 13px; line-height: 1.5;">${lines}</pre>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bot Logs — IPL Win Prediction</title>
  <style>
    body { font-family: monospace; max-width: 960px; margin: 20px auto; padding: 0 20px; background: #0d1117; color: #c9d1d9; }
    h1 { color: #58a6ff; font-family: sans-serif; }
    pre { white-space: pre-wrap; word-break: break-all; }
    .muted { color: #484f58; }
  </style>
</head>
<body>
  <h1>📋 Logs (last 60 min)</h1>
  <p class="muted">Newest first</p>
  ${rows}
</body>
</html>`;
};

/*
  Route registry mapping pathname patterns to their response factories.
*/
const routes: Record<string, { body: () => string; contentType: string }> = {
  "/health": { body: HEALTH_JSON, contentType: "application/json" },
  "/healthz": { body: HEALTH_JSON, contentType: "application/json" },
  "/": { body: LANDING_HTML, contentType: "text/html" },
  "/app/logs": { body: LOGS_HTML, contentType: "text/html" },
};

/*
  Start the HTTP server on the configured port.
  Uses Bun's built-in server (no express/fastify needed).
*/
export function startHttpServer() {
  const server = Bun.serve({
    port: config.http.port,
    fetch(request) {
      const url = new URL(request.url);
      const route = routes[url.pathname];

      if (route) {
        return new Response(route.body(), {
          status: 200,
          headers: { "Content-Type": route.contentType },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  logger.log(`  HTTP server listening on port ${server.port}`);
  return server;
}
