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
  ios: {
    ...config.ios,
    buildNumber: versionConfig.iosBuildNumber,
  },
  android: {
    ...config.android,
    package: "com.phlox1000.floridalottopredictor",
    versionCode: versionConfig.androidVersionCode,
  },
  extra: {
    ...config.extra,
    appVersion: versionConfig.version,
    buildNumber: String(versionConfig.androidVersionCode),
    channel: versionConfig.channel,
  },
});
