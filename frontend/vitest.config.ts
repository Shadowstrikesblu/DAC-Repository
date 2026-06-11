import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Config Vitest (tests frontend) — séparée de vite.config pour ne pas impacter le build.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
})
