import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    // Run tests sequentially — they share the filesystem (game state)
    sequence: {
      concurrent: false,
    },
  },
});
