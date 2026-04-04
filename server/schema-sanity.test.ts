import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPoolQuery,
  mockCreateMySqlPool,
} = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  mockCreateMySqlPool: vi.fn(),
}));

vi.mock("./_core/db-connection", () => ({
  createMySqlPool: mockCreateMySqlPool,
  getDatabaseUrlShape: vi.fn().mockReturnValue({
    scheme: "mysql",
    hostPresent: true,
    portPresent: true,
    databasePresent: true,
    sslMode: "none",
    parseError: null,
  }),
}));

describe("database schema sanity checks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.DATABASE_URL = "mysql://user:pass@host:3306/db";
  });

  it("marks personalization metrics as missing when table is absent", async () => {
    mockPoolQuery.mockImplementation(async (sqlText: string) => {
      if (sqlText.includes("INFORMATION_SCHEMA.TABLES")) {
        return [[
          { TABLE_NAME: "users" },
          { TABLE_NAME: "draw_results" },
        ]];
      }
      return [[]];
    });
    mockCreateMySqlPool.mockReturnValue({
      pool: { query: mockPoolQuery },
      sslConfigured: false,
      shape: {
        scheme: "mysql",
        hostPresent: true,
        portPresent: true,
        databasePresent: true,
        sslMode: "none",
      },
    });

    const db = await import("./db");
    await db.getDb();
    const sanity = await db.getDatabaseSchemaSanity();

    expect(sanity.checked).toBe(true);
    expect(sanity.personalizationMetricsAvailable).toBe(false);
    expect(sanity.missingTables).toContain("personalization_metrics");
    expect(sanity.personalizationFeaturesActive).toBe(false);
  });

  it("supports optional personalization metrics bootstrap when enabled", async () => {
    process.env.ALLOW_PERSONALIZATION_METRICS_BOOTSTRAP = "true";
    let tableCall = 0;
    mockPoolQuery.mockImplementation(async (sqlText: string) => {
      if (sqlText.includes("INFORMATION_SCHEMA.TABLES") && sqlText.includes("IN (")) {
        tableCall += 1;
        if (tableCall === 1) {
          return [[{ TABLE_NAME: "users" }]];
        }
      }
      if (sqlText.includes("INFORMATION_SCHEMA.TABLES") && sqlText.includes("TABLE_NAME = ?")) {
        return [[{ TABLE_NAME: "personalization_metrics" }]];
      }
      return [[]];
    });
    mockCreateMySqlPool.mockReturnValue({
      pool: { query: mockPoolQuery },
      sslConfigured: false,
      shape: {
        scheme: "mysql",
        hostPresent: true,
        portPresent: true,
        databasePresent: true,
        sslMode: "none",
      },
    });

    const db = await import("./db");
    await db.getDb();
    const sanity = await db.getDatabaseSchemaSanity();

    expect(sanity.bootstrap.attempted).toBe(true);
    expect(sanity.bootstrap.applied).toBe(true);
    expect(sanity.personalizationMetricsAvailable).toBe(true);
    expect(sanity.missingTables).not.toContain("personalization_metrics");
  });
});
