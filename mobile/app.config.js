// Wraps app.json. When EXPO_BASE_URL is set (e.g. "/app"), the web build is served from that sub-path
// of the main server — that's how the deployed server hosts the phone-browser version of the app.
// iPhone and Android are released separately: each takes its own version from versions.json. EAS sets
// EAS_BUILD_PLATFORM during a build; KINARA_PLATFORM lets a local build pick one.
const versions = require("./versions.json");
const platform = process.env.EAS_BUILD_PLATFORM || process.env.KINARA_PLATFORM || "web";
module.exports = ({ config }) => ({
  ...config,
  version: versions[platform] || config.version,
  experiments: { ...(config.experiments ?? {}), ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
  // Your Expo project id (expo.dev) for test builds and push notifications; `eas init` can also write it to app.json.
  extra: { ...(config.extra ?? {}), ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}) },
});
