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

/*
  Start the HTTP server on the configured port.
  Uses Bun's built-in server (no express/fastify needed).
  Returns the server instance so it can be stopped during shutdown.
*/
export function startHttpServer() {
  const server = Bun.serve({
    port: config.http.port,
    fetch(request) {
      const url = new URL(request.url);

      /*
        Health check endpoint.
        Returns a lightweight JSON response so Render knows the app is alive.
        Also useful for monitoring services like uptimerobot.
      */
      if (url.pathname === "/health" || url.pathname === "/healthz") {
        return new Response(
          JSON.stringify({
            status: "ok",
            uptime: Math.floor((Date.now() - START_TIME) / 1000),
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      /*
        Root endpoint — quick HTML page to confirm the bot is running.
        Useful when you open the Render URL in a browser.
      */
      if (url.pathname === "/") {
        return new Response(
          `<!DOCTYPE html>
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
</html>`,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          },
        );
      }

      /*
        404 for everything else.
      */
      return new Response("Not found", { status: 404 });
    },
  });

  logger.log(`  HTTP server listening on port ${server.port}`);
  return server;
}
