import type { ExpoConfig, ConfigContext } from "expo/config";

// Extends app.json with values that differ per build:
//  • EXPO_BASE_URL — set to "/app" when the web version is built to be served by the server at /app.
//  • EAS_PROJECT_ID — your Expo project id (from expo.dev), needed for test builds and push notifications.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  experiments: { ...config.experiments, ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
  extra: { ...config.extra, ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}) },
});
