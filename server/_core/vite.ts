import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

/**
 * Directory containing this module. After esbuild, the bundle is `dist/index.js`, so this is
 * `.../dist`. Static assets from `vite build` live in `dist/public` → **same directory as the
 * bundle, plus `/public`**. Using `../..` from `dist/` incorrectly escapes the repo (styled 404).
 */
const _CORE_DIR = path.dirname(fileURLToPath(import.meta.url));

function resolveClientDistPublic(): string {
  return path.basename(_CORE_DIR) === "dist"
    ? path.join(_CORE_DIR, "public")
    : path.resolve(_CORE_DIR, "..", "..", "dist", "public");
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(_CORE_DIR, "../../client/index.html");

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = resolveClientDistPublic();
  if (!fs.existsSync(distPath)) {
    console.error(
      `[serveStatic] Client build not found at ${distPath} (resolved from ${_CORE_DIR}). Run \`pnpm build\`.`
    );
  }

  app.use(express.static(distPath, { index: ["index.html"] }));

  // SPA: client routes (GET only; APIs are mounted earlier on the main app)
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
