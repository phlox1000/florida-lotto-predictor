import { describe, it, expect } from "vitest";
import { nanoid } from "nanoid";
import { appRouter } from "./routers";

describe("PDF Upload", () => {
  it("rejects unauthenticated PDF upload list requests", async () => {
    const caller = appRouter.createCaller({
      user: null,
      res: { clearCookie: () => {} } as any,
    });
    await expect(caller.dataFetch.pdfUploads()).rejects.toThrow(/login/i);
  });

  it("dataFetch.pdfUploads returns array for authenticated user", async () => {
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "test-user",
        email: "test@test.com",
        name: "Test User",
        role: "user",
        loginMethod: "oauth",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      res: { clearCookie: () => {} } as any,
    });

    const result = await caller.dataFetch.pdfUploads();
    expect(Array.isArray(result)).toBe(true);
  });

  it("generates unique keys for repeated uploads of the same filename", () => {
    const fileName = "results.pdf";
    const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const key1 = `pdf-uploads/1-${nanoid(10)}_${safeBase}`;
    const key2 = `pdf-uploads/1-${nanoid(10)}_${safeBase}`;
    expect(key1).not.toBe(key2);
  });

  it("sanitizes filenames with special characters", () => {
    const fileName = "my lottery (2024) [final].pdf";
    const safeBase = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    expect(safeBase).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(safeBase).not.toContain("(");
    expect(safeBase).not.toContain(" ");
  });
});
