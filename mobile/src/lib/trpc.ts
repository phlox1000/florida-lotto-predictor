import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";
import { API_TIMEOUT_MS, API_URL } from "./env";
import { getMobileAuthToken } from "./mobileAuthToken";

export const trpc = createTRPCReact<AppRouter>();

type TRPCFetch = NonNullable<Parameters<typeof httpBatchLink>[0]["fetch"]>;

const fetchWithTimeout: TRPCFetch = async (input, init) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input as Parameters<typeof fetch>[0], {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        fetch: fetchWithTimeout,
        headers: () => {
          const token = getMobileAuthToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
