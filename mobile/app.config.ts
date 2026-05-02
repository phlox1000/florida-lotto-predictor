import type { ConfigContext, ExpoConfig } from "expo/config";
import versionConfig from "./version.json";

// Build-time commit SHA, surfaced in the Analyze build-identity strip so a
// sideloaded APK user can tell us which bundle they're actually running.
//
// Resolution order:
//   1. EXPO_PUBLIC_COMMIT_SHA — explicit override (set this in eas.json
//      build profiles' `env` or in `eas update` shell when you want a
//      specific value, e.g. EXPO_PUBLIC_COMMIT_SHA=$GITHUB_SHA).
//   2. EAS_BUILD_GIT_COMMIT_HASH — auto-injected by EAS Build for native
//      builds; covers the embedded bundle case for free.
//   3. EAS_UPDATE_GIT_COMMIT_HASH — auto-injected by `eas update` for OTA
//      publishes; covers downloaded bundles for free.
//   4. "unknown" — local `expo start` / dev client fallback.
//
// Note: only EXPO_PUBLIC_* names are inlined into the JS bundle by Metro,
// but app.config.ts runs in Node at build/publish time, so we can read any
// process.env value here and bake it into `extra` directly.
const commitSha =
  process.env.EXPO_PUBLIC_COMMIT_SHA?.trim() ||
  process.env.EAS_BUILD_GIT_COMMIT_HASH?.trim() ||
  process.env.EAS_UPDATE_GIT_COMMIT_HASH?.trim() ||
  "unknown";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "mobile",
  slug: config.slug ?? "mobile",
  newArchEnabled: false,
  version: versionConfig.version,
  runtimeVersion: {
    policy: "appVersion",
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      "expo-image-picker",
      {
        photosPermission: "Allow Florida Lotto Predictor to choose ticket photos for ledger import review.",
        cameraPermission: "Allow Florida Lotto Predictor to capture ticket photos for ledger import review.",
      },
    ],
    "expo-secure-store",
  ],
  ios: {
    ...config.ios,
    buildNumber: versionConfig.iosBuildNumber,
  },
  android: {
    ...config.android,
    package: "com.phlox1000.floridalottopredictor",
    versionCode: versionConfig.androidVersionCode,
    blockedPermissions: Array.from(new Set([
      ...(config.android?.blockedPermissions ?? []),
      "android.permission.RECORD_AUDIO",
    ])),
  },
  extra: {
    ...config.extra,
    appVersion: versionConfig.version,
    buildNumber: String(versionConfig.androidVersionCode),
    channel: versionConfig.channel,
    commitSha,
  },
});
