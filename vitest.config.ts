import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    hookTimeout: 60_000,
    maxWorkers: 1,
    testTimeout: 10_000,
  },
});
