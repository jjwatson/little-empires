import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://jjwatson.github.io/little-empires/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/little-empires/',
  // The D6 Holocron item list is one lazily loaded chunk of ~630 kB (145 kB gzipped); that is intended.
  build: { chunkSizeWarningLimit: 700 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
