import { describe, it, expect } from "vitest";
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
});
