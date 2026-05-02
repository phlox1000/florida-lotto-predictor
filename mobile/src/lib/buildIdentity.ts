import Constants from "expo-constants";
import * as Updates from "expo-updates";

/**
 * Stable per-process snapshot of which JS bundle is actually running on the
 * device. Promoted to a production-visible UI element on the Analyze screen
 * so a user with a sideloaded APK can confirm at a glance whether the device
 * is on an old embedded bundle or a fresh OTA update.
 *
 * Read from expo-updates first (authoritative for OTA), with expo-constants
 * as a fallback for runtimeVersion when the Updates module hasn't initialized
 * yet (e.g. on web or in dev). The commit SHA is injected at build time via
 * app.config.ts → extra.commitSha.
 */
export type BuildIdentity = {
  runtimeVersion: string;
  updateId: string;
  commitSha: string | null;
};

function shortSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "unknown") return null;
  return trimmed.slice(0, 8);
}

export function getBuildIdentity(): BuildIdentity {
  const runtimeVersion =
    Updates.runtimeVersion ||
    (typeof Constants.expoConfig?.runtimeVersion === "string"
      ? Constants.expoConfig.runtimeVersion
      : Constants.expoConfig?.version) ||
    "unknown";

  const updateId = Updates.updateId ?? "embedded";

  const extra = (Constants.expoConfig?.extra ?? {}) as { commitSha?: unknown };
  const commitSha = shortSha(extra.commitSha);

  return { runtimeVersion, updateId, commitSha };
}

export function formatBuildIdentity(identity: BuildIdentity): string {
  const parts = [`rv ${identity.runtimeVersion}`, `id ${identity.updateId}`];
  if (identity.commitSha) parts.push(`sha ${identity.commitSha}`);
  return parts.join(" · ");
}
