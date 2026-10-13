import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/unit/server-only-stub.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
