import { TRPCError } from "@trpc/server";

export function normalizeConfirmScannedTicketError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;

  const message = error instanceof Error ? error.message : "";
  const lower = message.toLowerCase();

  if (lower.includes("already in progress")) {
    return new TRPCError({
      code: "CONFLICT",
      message: "Scanned ticket confirmation is already in progress. Please retry.",
    });
  }

  if (lower.includes("already confirmed with different rows")) {
    return new TRPCError({
      code: "CONFLICT",
      message: "This scan was already confirmed with different rows. Create a new scan to revise it.",
    });
  }

  if (lower.includes("duplicates an already confirmed scanned row")) {
    return new TRPCError({
      code: "CONFLICT",
      message: "This ticket row is already confirmed for the same draw.",
    });
  }

  if (
    lower.includes("invalid") ||
    lower.includes("unsupported game type") ||
    lower.includes("does not belong to scanned ticket") ||
    lower.includes("duplicate main numbers") ||
    lower.includes("out-of-range") ||
    lower.includes("duplicate special numbers") ||
    lower.includes("should not include special numbers") ||
    lower.includes("duplicates another confirmed row")
  ) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: message || "Invalid scanned ticket confirmation input.",
    });
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Failed to confirm scanned ticket.",
  });
}
