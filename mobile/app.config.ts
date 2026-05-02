import type { ConfigContext, ExpoConfig } from "expo/config";
import versionConfig from "./version.json";

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
  },
});
