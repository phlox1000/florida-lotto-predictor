import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { normalizeConfirmScannedTicketError } from "./scan-confirm-errors";

describe("normalizeConfirmScannedTicketError", () => {
  it("maps duplicate confirmed row conflicts to CONFLICT", () => {
    const error = normalizeConfirmScannedTicketError(
      new Error(
        "Row 66 duplicates an already confirmed scanned row (ticket 23, row 65)"
      )
    );
    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe("CONFLICT");
    expect(error.message).toMatch(/already confirmed/i);
  });

  it("maps invalid input errors to BAD_REQUEST", () => {
    const error = normalizeConfirmScannedTicketError(
      new Error("Row 12 has invalid main number count")
    );
    expect(error.code).toBe("BAD_REQUEST");
  });
});
