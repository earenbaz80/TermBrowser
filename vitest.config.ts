import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Dedicated test config so vite.config.ts (with its HMR "do not modify" rule) stays untouched
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
      thresholds: {
        lines: 22,
        functions: 22,
        branches: 18,
        statements: 22,
      },
    },
  },
});
