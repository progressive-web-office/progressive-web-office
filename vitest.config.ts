import { defineConfig } from 'vitest/config';
import app from './vite.config.ts';

export default defineConfig({
  // Build constants (version, commit) as in the app (UI-012).
  define: app.define,
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
