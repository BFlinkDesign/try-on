// @ts-check
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
    // fast-check runs 100 cases per property by default; a fixed seed per run is printed on failure for replay.
    testTimeout: 30000,
  },
});
