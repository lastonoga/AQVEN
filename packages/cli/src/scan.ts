import { readdir, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { synthesize, irHash } from "@wf/synth"
import type { Diagnostic, Ir } from "@wf/synth"
import type { Flow } from "@wf/dsl"
import { loadFlowModule, describeLoadFailure } from "./loader.js"

export const FLOW_SUFFIX = ".flow.ts"
const SKIP = new Set(["node_modules", ".git", ".wf", "dist", "dist-types"])

export type FlowEntry = {
  id: string
  file: string
  status: "ok" | "fail"
  version?: number
  nodeCount?: number
  irHash?: string
  ir?: Ir
  diagnostics: Diagnostic[]
}

export type ScanReport = {
  root: string
  pattern: string
  scanned: number
  found: number
  flows: FlowEntry[]
}

async function collect(dir: string, acc: string[], counter: { n: number }): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (SKIP.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      await collect(full, acc, counter)
      continue
    }
    counter.n++
    if (e.name.endsWith(FLOW_SUFFIX)) acc.push(full)
  }
}

function failure(file: string, code: string, message: string): FlowEntry {
  return { id: file.split("/").pop() ?? file, file, status: "fail", diagnostics: [{ code, message }] }
}

type Loaded = { ok: true; mod: unknown } | { ok: false; entry: FlowEntry }

async function readModule(file: string): Promise<Loaded> {
  try {
    return { ok: true, mod: await loadFlowModule(file) }
  } catch (error: unknown) {
    const described = describeLoadFailure(file, error)
    return { ok: false, entry: failure(file, described.code, described.message) }
  }
}

async function loadOne(file: string): Promise<FlowEntry> {
  const loaded = await readModule(file)
  if (!loaded.ok) return loaded.entry

  const flow = (loaded.mod as { default?: Flow }).default
  if (!flow || typeof flow !== "object" || !("nodes" in flow)) {
    return failure(file, "WF_NO_DEFAULT_EXPORT", "файл не экспортирует воркфлоу через export default defineFlow({...})")
  }

  const result = synthesize(flow)
  if (!result.ok) {
    return { id: flow.flow, file, status: "fail", version: flow.version, diagnostics: result.diagnostics }
  }
  return {
    id: result.ir.flow,
    file,
    status: "ok",
    version: result.ir.version,
    nodeCount: Object.keys(result.ir.nodes).length,
    irHash: irHash(result.ir),
    ir: result.ir,
    diagnostics: result.diagnostics,
  }
}

export async function scan(rootDir: string): Promise<ScanReport> {
  const root = resolve(rootDir)
  const isDir = await stat(root).then((s) => s.isDirectory()).catch(() => false)
  if (!isDir) {
    return { root, pattern: `**/*${FLOW_SUFFIX}`, scanned: 0, found: 0, flows: [] }
  }

  const files: string[] = []
  const counter = { n: 0 }
  await collect(root, files, counter)
  files.sort()

  const flows = await Promise.all(files.map((f) => loadOne(f)))
  return { root, pattern: `**/*${FLOW_SUFFIX}`, scanned: counter.n, found: files.length, flows }
}
