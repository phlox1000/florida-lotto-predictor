import { describe, expect, it } from "vitest";
import {
  buildMySqlPoolOptions,
  getDatabaseUrlShape,
} from "./_core/db-connection";

describe("db connection wiring", () => {
  it("parses mysql DATABASE_URL shape", () => {
    const shape = getDatabaseUrlShape(
      "mysql://user:pass@db.example.internal:3306/florida_lotto?sslmode=require"
    );
    expect(shape.scheme).toBe("mysql");
    expect(shape.hostPresent).toBe(true);
    expect(shape.portPresent).toBe(true);
    expect(shape.databasePresent).toBe(true);
    expect(shape.sslMode).toBe("require");
    expect(shape.parseError).toBeNull();
  });

  it("enables ssl for sslmode=require", () => {
    const built = buildMySqlPoolOptions(
      "mysql://user:pass@db.example.internal:3306/florida_lotto?sslmode=require"
    );
    expect(built.sslConfigured).toBe(true);
    expect(built.poolOptions.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("accepts explicit ssl JSON option", () => {
    const built = buildMySqlPoolOptions(
      `mysql://user:pass@db.example.internal:3306/florida_lotto?ssl=${encodeURIComponent(
        JSON.stringify({ rejectUnauthorized: true })
      )}`
    );
    expect(built.sslConfigured).toBe(true);
    expect(built.poolOptions.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("throws for non-mysql scheme", () => {
    expect(() =>
      buildMySqlPoolOptions("postgres://user:pass@host:5432/db")
    ).toThrow(/scheme must be mysql/i);
  });

  it("throws when DATABASE_URL is empty", () => {
    expect(() => buildMySqlPoolOptions("")).toThrow(/DATABASE_URL is not configured/i);
  });
});
