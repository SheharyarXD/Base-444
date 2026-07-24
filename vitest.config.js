import { defineConfig } from 'vitest/config';

// Deliberately separate from vite.config.js: that file's @base44/vite-plugin
// is app-build-only tooling with no relevance to testing the pure-logic
// modules under src/lib, and pulling it in would couple test runs to Base44
// app-id/env setup for no benefit.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx,ts,tsx}'],
  },
});
