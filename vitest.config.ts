import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    hookTimeout: 20_000,
    maxWorkers: 4,
    testTimeout: 10_000,
  },
});
