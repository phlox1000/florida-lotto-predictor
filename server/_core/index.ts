import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import fs from "node:fs";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { validateServerRuntimeConfigOnce } from "./runtime-config";
import { serveStatic, setupVite } from "./vite";
import { startAutoFetchSchedule } from "../cron";
import { getDatabaseSchemaSanity } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateServerRuntimeConfigOnce();
  try {
    const sanity = await getDatabaseSchemaSanity();
    if (sanity.missingTables.length > 0) {
      console.error("[STARTUP][SCHEMA_SANITY][DEGRADED_MODE]", {
        missingTables: sanity.missingTables,
        personalizationFeaturesActive: sanity.personalizationFeaturesActive,
      });
    } else {
      console.info("[STARTUP][SCHEMA_SANITY][OK]", {
        requiredTableCount: sanity.requiredTables.length,
      });
    }
  } catch (error) {
    console.error("[STARTUP][SCHEMA_SANITY][FAILED]", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const app = express();
  const server = createServer(app);
  const uploadsDir = ENV.localUploadsDir || path.join("/tmp", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use("/uploads", express.static(uploadsDir));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // PDF upload route (needs raw body, registered before tRPC)
  const { registerUploadRoutes } = await import("../upload");
  registerUploadRoutes(app);
  const { registerOpenAiOcrProofRoute } = await import("../openai-ocr-proof-route");
  registerOpenAiOcrProofRoute(app);

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

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start the auto-fetch cron schedule
    startAutoFetchSchedule();
  });
}

startServer().catch(console.error);
