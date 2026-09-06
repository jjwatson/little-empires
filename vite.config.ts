import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://jjwatson.github.io/little-empires/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/little-empires/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
