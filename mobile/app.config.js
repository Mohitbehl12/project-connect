// Wraps app.json. When EXPO_BASE_URL is set (e.g. "/app"), the web build is served from that sub-path
// of the main server — that's how the deployed server hosts the phone-browser version of the app.
module.exports = ({ config }) => ({
  ...config,
  experiments: { ...(config.experiments ?? {}), ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}) },
});
