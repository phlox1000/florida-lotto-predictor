import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { logStartupEnv, registerProcessHandlers } from "./processHandlers";
import { serveStatic, setupVite } from "./vite";

logStartupEnv();
registerProcessHandlers();

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust two upstream proxy hops: Cloudflare edge → Render LB → app.
  //
  // Render proxies all *.onrender.com traffic through Cloudflare for
  // DDoS protection by default, so the production topology is two hops,
  // not one. With `trust proxy: 1` Express was treating the Cloudflare
  // edge POP IP as the client and returning that from `req.ip` — and CF
  // load-balances across many POPs, so a burst of requests from the same
  // real client appeared to come from many different IPs. That broke the
  // PR #34 per-IP rate limits (smoke test: 11 garbage logins all returned
  // 200 instead of the 11th hitting 429). Bumping to 2 makes Express
  // walk the X-Forwarded-For chain past CF's entry to the real client.
  //
  // We don't use `trust proxy: true` because it would also trust an XFF
  // set by a directly-connected attacker, in the (currently impossible)
  // event that the app became reachable without going through Cloudflare.
  // An explicit hop count documents the topology and fails closed if it
  // changes.
  //
  // For per-IP rate limiting the canonical source is actually Cloudflare's
  // CF-Connecting-IP header (always set by CF, stripped on inbound, can't
  // be spoofed) — see server/lib/clientIp.ts. This setting is kept correct
  // anyway for any future code that reads `req.ip` directly (request
  // logging, abuse heuristics, audit trails, etc.).
  app.set("trust proxy", 2);

  // Health check. Registered before any body parsers, middleware, or
  // routers so that the endpoint is as cheap as possible (no JSON
  // parsing, no auth, no tRPC context) and so it keeps responding
  // even if a downstream router is misconfigured. Render can be
  // pointed at this path via Settings -> Health Check Path = /healthz
  // to enable zero-downtime rollouts (new container must answer 200
  // on /healthz before old container is retired).
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true, uptime: process.uptime() });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: Date.now(),
      oauthConfigured:
        Boolean(process.env.OAUTH_SERVER_URL?.trim()) ||
        Boolean(process.env.MANUS_OAUTH_BASE_URL?.trim()),
    });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // PDF upload route (needs raw body, registered before tRPC)
  const { registerUploadRoutes } = await import("../upload");
  registerUploadRoutes(app);

  // tRPC API (root `/trpc` for explicit mobile/API contracts; `/api/trpc` retained for web SPA)
  const trpcExpressMiddleware = createExpressMiddleware({
    router: appRouter,
    createContext,
  });
  app.use("/trpc", trpcExpressMiddleware);
  app.use("/api/trpc", trpcExpressMiddleware);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Bind to the port Render (or any PaaS) injects via PORT, defaulting
  // to 3000 for local dev. Bind on 0.0.0.0 so the container is
  // reachable from outside the pod; the previous implementation
  // probed 20 ports starting at PORT which, on Render, is both
  // unnecessary (Render only routes traffic to PORT) and can cause
  // the port-scan window to time out if the probe briefly holds the
  // real port. If PORT is taken, the failure should be loud and
  // immediate rather than silently rerouted.
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on 0.0.0.0:${port} (NODE_ENV=${process.env.NODE_ENV ?? "unset"})`);
    // Auto-fetch scraping runs out-of-process as a Render Cron Job;
    // see server/cron-runner.ts. Do not re-introduce a setInterval
    // scraper here — it would race the external scheduler and break
    // safe horizontal scaling.
  });
}

startServer().catch(err => {
  console.error("Fatal: failed to start server", err);
  process.exit(1);
});
