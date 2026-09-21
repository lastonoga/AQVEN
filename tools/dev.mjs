import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lumenRoot = resolve(root, 'examples/lumen')
const studioRoot = resolve(root, 'apps/studio')
const aqven = resolve(root, '.venv/bin/aqven')
const watchfiles = resolve(root, '.venv/bin/watchfiles')
const vite = resolve(studioRoot, 'node_modules/vite/bin/vite.js')
const host = '127.0.0.1'
const backendPort = port('AQVEN_DEV_BACKEND_PORT', 5200)
const studioPort = port('AQVEN_DEV_STUDIO_PORT', 5173)
const ownerPort = 40000 + createHash('sha256').update(lumenRoot).digest().readUInt32BE(0) % 10000
const dataDir = process.env.AQVEN_DEV_DATA_DIR
const readyTimeoutMs = 30_000
const shutdownTimeoutMs = 12_000
let closing = false
let interrupted = false
let backend
let studio
let owner
const childExits = []

function port(name, fallback) {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be a port from 1 to 65535`)
  }
  return parsed
}

function quote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function occupied(portNumber) {
  return new Promise((resolveResult) => {
    const socket = connect({ host, port: portNumber })
    const finish = (value) => {
      socket.destroy()
      resolveResult(value)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(500, () => finish(false))
  })
}

function exited(child) {
  return new Promise((resolveResult, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolveResult({ code, signal }))
  })
}

async function acquireOwner() {
  const server = createServer((socket) => socket.destroy())
  try {
    await new Promise((resolveReady, reject) => {
      server.once('error', reject)
      server.listen({ host, port: ownerPort, exclusive: true }, resolveReady)
    })
  } catch (error) {
    if (error instanceof Error && Reflect.get(error, 'code') === 'EADDRINUSE') {
      throw new Error('another Lumen development launcher is already running for this checkout')
    }
    throw error
  }
  return server
}

async function runningProjectServer() {
  try {
    const record = JSON.parse(readFileSync(resolve(lumenRoot, '.aqven/server.json'), 'utf8'))
    if (record.project_root !== lumenRoot || typeof record.url !== 'string') return null
    const response = await fetch(`${record.url}/api/ready`, {
      headers: typeof record.token === 'string' ? { Authorization: `Bearer ${record.token}` } : {},
      signal: AbortSignal.timeout(1000),
    })
    return response.ok ? record.url : null
  } catch {
    return null
  }
}

function stop() {
  if (closing) return
  closing = true
  for (const child of [studio, backend]) {
    if (child && child.exitCode === null) child.kill('SIGINT')
  }
  const timer = setTimeout(() => {
    for (const child of [studio, backend]) {
      if (child && child.exitCode === null) child.kill('SIGKILL')
    }
  }, shutdownTimeoutMs)
  timer.unref()
}

async function waitForBackend(exitPromise) {
  const deadline = Date.now() + readyTimeoutMs
  const watcherEnded = exitPromise.then(() => { throw new Error('backend watcher exited before the API was ready') })
  while (!closing && Date.now() < deadline) {
    const result = await Promise.race([
      fetch(`http://${host}:${backendPort}/api/ready`, { signal: AbortSignal.timeout(1000) })
        .then((response) => response.ok)
        .catch(() => false),
      watcherEnded,
    ])
    if (result) return
    await new Promise((resolveResult) => setTimeout(resolveResult, 250))
  }
  throw new Error(closing ? 'development stack stopped' : 'backend did not become ready within 30 seconds')
}

async function startStack() {
  for (const executable of [aqven, watchfiles, vite]) {
    if (!existsSync(executable)) throw new Error(`missing ${executable}; install Python and Studio dependencies first`)
  }
  if (backendPort === studioPort) throw new Error('backend and Studio ports must differ')
  const existing = await runningProjectServer()
  if (existing) throw new Error(`Lumen backend is already running at ${existing}; reuse it or stop it before pnpm dev`)
  const ports = [['backend', backendPort], ['Studio', studioPort]]
  if (studioPort !== 5174) ports.push(['existing Studio', 5174])
  for (const [name, portNumber] of ports) {
    if (await occupied(portNumber)) {
      throw new Error(`${name} port ${portNumber} is already in use; reuse the running stack or stop it before pnpm dev`)
    }
  }

  const command = [
    aqven, 'dev', lumenRoot, '--host', host, '--port', String(backendPort), '--headless', '--no-browser',
    '--dev-origin', `http://${host}:${studioPort}`,
    ...(dataDir ? ['--data-dir', dataDir] : []),
  ].map(quote).join(' ')
  backend = spawn(watchfiles, [
    '--target-type', 'command', '--filter', 'python', '--sigint-timeout', '10',
    command,
    resolve(root, 'packages/aqven/src'),
    resolve(root, 'packages/aqven-llm/src'),
    lumenRoot,
  ], { cwd: root, stdio: 'inherit' })
  const backendExit = exited(backend)
  childExits.push(backendExit)
  await waitForBackend(backendExit)
  if (closing) return

  studio = spawn(process.execPath, [vite, '--host', host, '--port', String(studioPort), '--strictPort'], {
    cwd: studioRoot,
    env: {
      ...process.env,
      AQVEN_ROOT: lumenRoot,
      AQVEN_SERVER_JSON: resolve(lumenRoot, '.aqven/server.json'),
    },
    stdio: 'inherit',
  })
  const studioExit = exited(studio)
  childExits.push(studioExit)
  console.log(`Studio: http://${host}:${studioPort}/  |  API: http://${host}:${backendPort}/`)
  const first = await Promise.race([backendExit, studioExit])
  if (!closing) {
    console.error(`Development process exited unexpectedly (${first.signal ?? first.code ?? 'unknown'}).`)
    process.exitCode = 1
    stop()
  }
  await Promise.allSettled([backendExit, studioExit])
}

async function main() {
  owner = await acquireOwner()
  try {
    await startStack()
  } finally {
    stop()
    await Promise.allSettled(childExits)
    await new Promise((resolveClosed) => owner.close(resolveClosed))
  }
}

function interrupt() {
  interrupted = true
  stop()
}

process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)
main().catch((error) => {
  if (!interrupted) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
  stop()
})
