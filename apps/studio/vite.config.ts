import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const SCREEN_TEST_TIMEOUT_MS = 30_000

const packages = (...names: readonly string[]): RegExp => new RegExp(`[\\\\/]node_modules[\\\\/](?:${names.join('|')})[\\\\/]`)

const chunkGroups = [
  { name: 'mock-data', test: /[\\/]src[\\/]mocks[\\/]data[\\/]/ },
  { name: 'react', test: packages('react', 'react-dom', 'scheduler') },
  { name: 'canvas', test: packages('@xyflow', 'd3-[a-z]+') },
  { name: 'chat', test: packages('@assistant-ui', 'assistant-stream', 'assistant-cloud', 'zod') },
]

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:5180' },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: chunkGroups },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: SCREEN_TEST_TIMEOUT_MS,
  },
})
