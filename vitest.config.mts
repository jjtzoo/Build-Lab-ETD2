import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Several engine suites run a full need-directed planner search.
    // Under parallel execution on a loaded machine these are CPU-bound
    // and slow; the timeouts are generous so contention never fails a
    // correctness assertion. Wall-time regressions are guarded by the
    // deterministic diagnostics in buildPlanner.test.ts instead.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});