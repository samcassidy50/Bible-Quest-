/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works inside Capacitor's native WebView.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Phaser is ~1.5 MB; it's bundled locally, not downloaded.
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      include: ['src/core/**'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
