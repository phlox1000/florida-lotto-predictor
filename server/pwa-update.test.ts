import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SW_PATH = resolve(__dirname, "../client/public/sw.js");
const INDEX_HTML_PATH = resolve(__dirname, "../client/index.html");

describe("service worker (sw.js)", () => {
  const swContent = readFileSync(SW_PATH, "utf-8");

  it("defines APP_VERSION constant", () => {
    expect(swContent).toMatch(/const APP_VERSION\s*=\s*['"][^'"]+['"]/);
  });

  it("uses versioned cache name", () => {
    expect(swContent).toContain("CACHE_NAME");
    expect(swContent).toMatch(/fl-lotto-oracle-v/);
  });

  it("does NOT auto-skipWaiting on install", () => {
    // The install handler should NOT call self.skipWaiting() as executable code
    const installStart = swContent.indexOf("self.addEventListener('install'");
    expect(installStart).toBeGreaterThan(-1);
    const activateStart = swContent.indexOf("// ─── Activate");
    expect(activateStart).toBeGreaterThan(installStart);
    const installBlock = swContent.slice(installStart, activateStart);
    // Remove comments before checking — comments mentioning skipWaiting are OK
    const codeOnly = installBlock.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(codeOnly).not.toContain("self.skipWaiting()");
  });

  it("has a message handler for SKIP_WAITING", () => {
    expect(swContent).toContain("SKIP_WAITING");
    expect(swContent).toContain("self.skipWaiting()");
  });

  it("has a message handler for GET_VERSION", () => {
    expect(swContent).toContain("GET_VERSION");
    expect(swContent).toContain("SW_VERSION");
  });

  it("sends SW_ACTIVATED message on activate", () => {
    expect(swContent).toContain("SW_ACTIVATED");
    expect(swContent).toContain("client.postMessage");
  });

  it("cleans old caches on activate", () => {
    expect(swContent).toContain("caches.keys()");
    expect(swContent).toContain("caches.delete");
  });

  it("claims clients on activate", () => {
    expect(swContent).toContain("self.clients.claim()");
  });

  it("uses network-first fetch strategy for same-origin", () => {
    expect(swContent).toContain("fetch(request)");
    expect(swContent).toContain("caches.match(request)");
    // Should cache successful responses
    expect(swContent).toContain("cache.put(request, clone)");
  });

  it("skips API requests from caching", () => {
    expect(swContent).toContain("/api/");
  });

  it("handles push notifications", () => {
    expect(swContent).toContain("self.addEventListener('push'");
    expect(swContent).toContain("showNotification");
  });

  it("handles notification clicks", () => {
    expect(swContent).toContain("notificationclick");
    expect(swContent).toContain("openWindow");
  });
});

describe("index.html SW registration", () => {
  const htmlContent = readFileSync(INDEX_HTML_PATH, "utf-8");

  it("registers the service worker", () => {
    expect(htmlContent).toContain("navigator.serviceWorker.register('/sw.js'");
  });

  it("stores registration globally for React access", () => {
    expect(htmlContent).toContain("window.__swRegistration");
  });

  it("checks for updates every 5 minutes", () => {
    expect(htmlContent).toContain("5 * 60 * 1000");
  });

  it("dispatches sw-update-available custom event", () => {
    expect(htmlContent).toContain("sw-update-available");
    expect(htmlContent).toContain("CustomEvent");
  });

  it("detects already-waiting service workers", () => {
    expect(htmlContent).toContain("reg.waiting");
  });

  it("listens for updatefound events", () => {
    expect(htmlContent).toContain("updatefound");
  });

  it("reloads page on controllerchange", () => {
    expect(htmlContent).toContain("controllerchange");
    expect(htmlContent).toContain("window.location.reload()");
  });

  it("prevents multiple reloads with refreshing flag", () => {
    expect(htmlContent).toContain("refreshing");
  });
});

describe("UpdatePrompt component file", () => {
  const componentPath = resolve(__dirname, "../client/src/components/UpdatePrompt.tsx");
  const componentContent = readFileSync(componentPath, "utf-8");

  it("exists and exports a default component", () => {
    expect(componentContent).toContain("export default function UpdatePrompt");
  });

  it("listens for sw-update-available event", () => {
    expect(componentContent).toContain("sw-update-available");
  });

  it("sends SKIP_WAITING message to service worker", () => {
    expect(componentContent).toContain("SKIP_WAITING");
    expect(componentContent).toContain("postMessage");
  });

  it("has an Update Now button", () => {
    expect(componentContent).toContain("Update Now");
  });

  it("has a dismiss button", () => {
    expect(componentContent).toContain("Dismiss");
  });

  it("declares Window.__swRegistration type", () => {
    expect(componentContent).toContain("__swRegistration");
  });
});

describe("Settings page version card", () => {
  const settingsPath = resolve(__dirname, "../client/src/pages/Settings.tsx");
  const settingsContent = readFileSync(settingsPath, "utf-8");

  it("includes AppVersionCard component", () => {
    expect(settingsContent).toContain("AppVersionCard");
  });

  it("requests SW version via GET_VERSION message", () => {
    expect(settingsContent).toContain("GET_VERSION");
  });

  it("displays SW_VERSION response", () => {
    expect(settingsContent).toContain("SW_VERSION");
  });

  it("has a Check for Updates button", () => {
    expect(settingsContent).toContain("Check for Updates");
  });

  it("calls reg.update() to check for new versions", () => {
    expect(settingsContent).toContain("reg.update()");
  });
});
