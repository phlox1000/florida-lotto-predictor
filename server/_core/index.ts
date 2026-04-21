import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Trust exactly one upstream proxy hop (Render's load balancer).
  //
  // Without this, Express's `req.ip` returns the LB's source address
  // (a fixed Render-internal IP) for every request, which would make
  // any per-IP rate limit effectively a global one — every visitor in
  // the world would share the same bucket. The `1` (instead of `true`)
  // limits trust to the first proxy in the X-Forwarded-For chain, so a
  // client cannot spoof a different IP just by setting their own XFF
  // header (Render's LB always overwrites/appends the client IP last).
  //
  // Used by:
  //   - server/routers/auth.router.ts (login/register rate limits)
  //   - any future caller of checkRateLimit() that keys by IP
  app.set("trust proxy", 1);

  // Health check. Registered before any body parsers, middleware, or
  // routers so that the endpoint is as cheap as possible (no JSON
  // parsing, no auth, no tRPC context) and so it keeps responding
  // even if a downstream router is misconfigured. Render can be
  // pointed at this path via Settings -> Health Check Path = /healthz
  // to enable zero-downtime rollouts (new container must answer 200
  // on /healthz before old container is retired).
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", uptime: process.uptime() });
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // PDF upload route (needs raw body, registered before tRPC)
  const { registerUploadRoutes } = await import("../upload");
  registerUploadRoutes(app);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
