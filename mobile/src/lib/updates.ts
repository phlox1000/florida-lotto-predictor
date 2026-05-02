import * as Updates from "expo-updates";

/**
 * Try to fetch a pending OTA update, if one is available, without blocking
 * the app. All failure modes are swallowed — update plumbing must never be
 * able to crash the app or surface raw errors to the user.
 *
 * Gated by `!__DEV__ && Updates.isEnabled` so dev clients and Expo Go are
 * unaffected, and so we no-op cleanly on platforms where Updates isn't
 * supported (web, simulators in some configurations).
 *
 * Returns true if a new bundle is now staged on disk and ready to be
 * activated by Updates.reloadAsync(); false otherwise.
 */
export async function fetchPendingUpdate(): Promise<boolean> {
  if (__DEV__) return false;
  if (!Updates.isEnabled) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const fetched = await Updates.fetchUpdateAsync();
    return Boolean(fetched.isNew);
  } catch {
    return false;
  }
}

/**
 * Apply a previously fetched update by reloading the JS runtime against the
 * new bundle. Wrapped in try/catch so a reload failure never leaves the user
 * with a frozen app — worst case the prompt closes and the update applies
 * on next cold launch.
 */
export async function applyPendingUpdate(): Promise<void> {
  if (__DEV__) return;
  if (!Updates.isEnabled) return;
  try {
    await Updates.reloadAsync();
  } catch {
    // No-op — next cold launch will pick up the staged bundle.
  }
}
