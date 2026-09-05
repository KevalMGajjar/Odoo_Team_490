import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    root: '.',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
    },
    setupFiles: ['tests/helpers/setup.ts'],
    alias: {
      '@helpers': resolve(__dirname, 'tests/helpers'),
      '@fixtures': resolve(__dirname, 'tests/fixtures'),
      '@backend': resolve(__dirname, 'backend/src'),
    },
  },
})
