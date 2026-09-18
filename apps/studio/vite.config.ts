import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const SCREEN_TEST_TIMEOUT_MS = 30_000
const DEFAULT_SERVER = 'http://127.0.0.1:5180'

type ServerRecord = { readonly url: string; readonly token: string }

const isServerRecord = (value: unknown): value is ServerRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'url') === 'string' &&
  typeof Reflect.get(value, 'token') === 'string'

const serverRecord = (): ServerRecord | null => {
  const path = process.env['AQVEN_SERVER_JSON'] ?? resolve(process.env['AQVEN_ROOT'] ?? '.', '.aqven/server.json')
  try {
    const record: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isServerRecord(record) ? record : null
  } catch {
    return null
  }
}

const apiProxy = () => {
  const record = serverRecord()
  const target = record?.url ?? DEFAULT_SERVER
  const headers = record === null ? undefined : { Authorization: `Bearer ${record.token}`, Origin: target }
  return { target, changeOrigin: true, ...(headers === undefined ? {} : { headers }) }
}

const packages = (...names: readonly string[]): RegExp => new RegExp(`[\\\\/]node_modules[\\\\/](?:${names.join('|')})[\\\\/]`)

const chunkGroups = [
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
    proxy: { '/api': apiProxy(), '/mcp': apiProxy() },
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
