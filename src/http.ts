/*
  Minimal HTTP server for Render health checks.
  Render requires a web service to bind to a port and respond to requests.
  Without this, Render would kill the container thinking it failed to start.

  Endpoints:
    GET /        — simple HTML landing page
    GET /health  — JSON health check (used by Render's health monitoring)
*/

import { config } from "./config";
import { logger } from "./utils/logger";

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

/*
  Route registry mapping pathname patterns to their response factories.
  No if/else chains — just a lookup table.
*/
const routes: Record<string, { body: () => string; contentType: string }> = {
  "/health": { body: HEALTH_JSON, contentType: "application/json" },
  "/healthz": { body: HEALTH_JSON, contentType: "application/json" },
  "/": { body: LANDING_HTML, contentType: "text/html" },
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
