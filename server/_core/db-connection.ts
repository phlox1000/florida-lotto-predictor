import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

export type DatabaseUrlShape = {
  scheme: string | null;
  hostPresent: boolean;
  portPresent: boolean;
  databasePresent: boolean;
  sslMode: string | null;
  parseError: string | null;
};

function parseBooleanLike(value: string | null): boolean | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "require"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  return null;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resolveSslFromUrl(url: URL): {
  ssl: PoolOptions["ssl"] | undefined;
  sslMode: string | null;
  sslConfigured: boolean;
} {
  const rawSslMode = url.searchParams.get("sslmode");
  const sslMode = rawSslMode ? rawSslMode.trim().toLowerCase() : null;
  const rawSsl = url.searchParams.get("ssl");
  const sslBool = parseBooleanLike(rawSsl);

  if (rawSsl && rawSsl.trim().startsWith("{")) {
    const parsed = safeJsonParse(rawSsl.trim());
    if (parsed && typeof parsed === "object") {
      return {
        ssl: parsed as PoolOptions["ssl"],
        sslMode,
        sslConfigured: true,
      };
    }
  }

  if (sslBool === true) {
    return {
      // Railway and many managed MySQL providers terminate TLS with cert chains
      // that can require non-strict verification in app runtimes unless CA is supplied.
      ssl: { rejectUnauthorized: false },
      sslMode,
      sslConfigured: true,
    };
  }

  if (sslBool === false) {
    return {
      ssl: undefined,
      sslMode,
      sslConfigured: false,
    };
  }

  if (sslMode === "require") {
    return {
      ssl: { rejectUnauthorized: false },
      sslMode,
      sslConfigured: true,
    };
  }

  if (sslMode === "verify-ca" || sslMode === "verify-full") {
    return {
      ssl: { rejectUnauthorized: true },
      sslMode,
      sslConfigured: true,
    };
  }

  return {
    ssl: undefined,
    sslMode,
    sslConfigured: false,
  };
}

export function getDatabaseUrlShape(databaseUrl: string): DatabaseUrlShape {
  const raw = String(databaseUrl || "").trim();
  if (!raw) {
    return {
      scheme: null,
      hostPresent: false,
      portPresent: false,
      databasePresent: false,
      sslMode: null,
      parseError: null,
    };
  }

  try {
    const url = new URL(raw);
    const dbName = url.pathname.replace(/^\/+/, "");
    const sslModeRaw = url.searchParams.get("sslmode");
    return {
      scheme: url.protocol.replace(/:$/, "") || null,
      hostPresent: Boolean(url.hostname),
      portPresent: Boolean(url.port),
      databasePresent: dbName.length > 0,
      sslMode: sslModeRaw ? sslModeRaw.trim().toLowerCase() : null,
      parseError: null,
    };
  } catch (error) {
    return {
      scheme: null,
      hostPresent: false,
      portPresent: false,
      databasePresent: false,
      sslMode: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildMySqlPoolOptions(databaseUrl: string): {
  poolOptions: PoolOptions;
  shape: DatabaseUrlShape;
  sslConfigured: boolean;
} {
  const raw = String(databaseUrl || "").trim();
  if (!raw) {
    throw new Error("DATABASE_URL is not configured");
  }

  const shape = getDatabaseUrlShape(raw);
  if (shape.parseError) {
    throw new Error(`DATABASE_URL parse error: ${shape.parseError}`);
  }
  if (shape.scheme !== "mysql") {
    throw new Error(`DATABASE_URL scheme must be mysql (received: ${shape.scheme || "unknown"})`);
  }

  const url = new URL(raw);
  const sslResolved = resolveSslFromUrl(url);
  const poolOptions: PoolOptions = {
    uri: raw,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    ssl: sslResolved.ssl,
  };

  return {
    poolOptions,
    shape,
    sslConfigured: sslResolved.sslConfigured,
  };
}

export function createMySqlPool(databaseUrl: string): {
  pool: Pool;
  shape: DatabaseUrlShape;
  sslConfigured: boolean;
} {
  const built = buildMySqlPoolOptions(databaseUrl);
  return {
    pool: mysql.createPool(built.poolOptions),
    shape: built.shape,
    sslConfigured: built.sslConfigured,
  };
}
