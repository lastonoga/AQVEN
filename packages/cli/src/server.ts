import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { serveStatic } from "@hono/node-server/serve-static"
import { existsSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { closeEvents, eventsHandler, publish } from "./events.js"
import { Executor, describeFlowInput } from "./executor.js"
import { SqliteRunsDb, runsDbPath } from "./runs-db.js"
import { scan } from "./scan.js"
import type { ServerType } from "@hono/node-server"
import type { AddressInfo } from "node:net"
import type { ServerEvent } from "./events.js"
import type { RunsRepository } from "./runs-db.js"
import type { FlowEntry, ScanReport } from "./scan.js"

export type { Run, RunEvent, RunStatus, ServerEvent } from "./events.js"
export type { Render, RunDetail, RunsRepository } from "./runs-db.js"
export type { InputSchema } from "./executor.js"

export const HOST = "127.0.0.1"
export const DEFAULT_PORT = 5180

export type FlowSummary = {
  id: string
  version: number
  file: string
  nodes: number
  status: "ok" | "fail"
  irHash?: string
}

export const RUNS_LIMIT = 50

export type ServerHandle = {
  url: string
  setState(report: ScanReport, synthMs?: number): void
  close(): Promise<void>
}

const EMPTY_REPORT: ScanReport = { root: "", pattern: "", scanned: 0, found: 0, flows: [] }

const summaryOf = (entry: FlowEntry): FlowSummary => ({
  id: entry.id,
  version: entry.version ?? 0,
  file: entry.file,
  nodes: entry.nodeCount ?? 0,
  status: entry.status,
  irHash: entry.irHash,
})

const flowEvent = (entry: FlowEntry): ServerEvent =>
  entry.status === "ok"
    ? { t: "diagnostics", flow: entry.id, diagnostics: entry.diagnostics }
    : {
        t: "synth_error",
        flow: entry.id,
        file: entry.file,
        message: entry.diagnostics.map((d) => `${d.code}: ${d.message}`).join("; "),
      }

class FlowState {
  private report: ScanReport = EMPTY_REPORT
  private lastSynthMs = 0

  get synthMs(): number {
    return this.lastSynthMs
  }

  replace(report: ScanReport, synthMs: number): void {
    this.report = report
    this.lastSynthMs = synthMs
    this.announce()
  }

  summaries(): FlowSummary[] {
    return this.report.flows.map(summaryOf)
  }

  find(id: string): FlowEntry | undefined {
    return this.report.flows.find((f) => f.id === id)
  }

  private announce(): void {
    publish({ t: "synth", flows: this.report.flows.map((f) => f.id), ms: this.lastSynthMs })
    for (const entry of this.report.flows) publish(flowEvent(entry))
  }
}

const toArrayBuffer = (view: Uint8Array): ArrayBuffer =>
  view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer

type RunRequest = { flow: string; input: unknown }

const isRunRequest = (body: unknown): body is RunRequest =>
  !!body && typeof body === "object" && typeof (body as { flow?: unknown }).flow === "string"

function uiRoot(): string | null {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "../../../apps/playground/dist"),
    join(here, "../../apps/playground/dist"),
  ]
  return candidates.find((c) => existsSync(join(c, "index.html"))) ?? null
}

function buildApp(state: FlowState, db: RunsRepository, executor: Executor): Hono {
  const app = new Hono()

  app.get("/api/flows", (c) => c.json(state.summaries()))

  app.get("/api/flows/:id", (c) => {
    const id = c.req.param("id")
    const entry = state.find(id)
    if (!entry) return c.json({ error: "flow_not_found", flow: id }, 404)
    if (!entry.ir) return c.json({ error: "flow_not_synthesized", flow: id, diagnostics: entry.diagnostics }, 422)
    return c.json({ ir: entry.ir, synthMs: state.synthMs })
  })

  app.get("/api/flows/:id/diagnostics", (c) => {
    const id = c.req.param("id")
    const entry = state.find(id)
    if (!entry) return c.json({ error: "flow_not_found", flow: id }, 404)
    return c.json(entry.diagnostics)
  })

  app.get("/api/flows/:id/input-schema", (c) => {
    const id = c.req.param("id")
    const entry = state.find(id)
    if (!entry) return c.json({ error: "flow_not_found", flow: id }, 404)
    if (!entry.ir) return c.json({ error: "flow_not_synthesized", flow: id, diagnostics: entry.diagnostics }, 422)
    return c.json(describeFlowInput(entry.ir))
  })

  app.post("/api/runs", async (c) => {
    const body: unknown = await c.req.json().catch(() => null)
    if (!isRunRequest(body))
      return c.json({ error: "bad_request", message: "ожидается { flow: string; input: unknown }" }, 400)

    const entry = state.find(body.flow)
    if (!entry) return c.json({ error: "flow_not_found", flow: body.flow }, 404)
    if (!entry.ir)
      return c.json({ error: "flow_not_synthesized", flow: body.flow, diagnostics: entry.diagnostics }, 422)

    const run = executor.start(entry.ir, entry.irHash, body.input ?? null)
    return c.json({ runId: run.id, run }, 201)
  })

  app.get("/api/runs", (c) => c.json(db.listRuns(RUNS_LIMIT)))

  app.get("/api/runs/:runId", (c) => {
    const runId = c.req.param("runId")
    const detail = db.findRun(runId)
    if (!detail) return c.json({ error: "run_not_found", runId }, 404)
    return c.json(detail)
  })

  app.get("/api/blobs/:id", (c) => {
    const id = c.req.param("id")
    const blob = db.findBlob(id)
    if (!blob) return c.json({ error: "blob_not_found", id }, 404)
    return c.body(toArrayBuffer(blob.body), 200, {
      "Content-Type": blob.mime,
      "Content-Length": String(blob.body.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(blob.name)}`,
      "Cache-Control": "public, max-age=31536000, immutable",
    })
  })

  app.get("/api/events", eventsHandler)

  const ui = uiRoot()
  if (ui === null) {
    app.get("/", (c) => c.text("UI не собран: pnpm --filter @wf/playground build", 503))
    return app
  }
  const rel = relative(process.cwd(), ui) || "."
  app.use("/assets/*", serveStatic({ root: rel }))
  app.get("*", serveStatic({ root: rel, path: "index.html" }))

  return app
}

function listen(app: Hono, port: number): Promise<{ server: ServerType; address: AddressInfo }> {
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port, hostname: HOST }, (address) => resolve({ server, address }))
    server.once("error", reject)
  })
}

function dropConnections(server: ServerType): void {
  if (!("closeAllConnections" in server)) return
  server.closeAllConnections()
}

function shutdown(server: ServerType): Promise<void> {
  return new Promise((resolve, reject) => {
    closeEvents()
    server.close((err) => (err ? reject(err) : resolve()))
    dropConnections(server)
  })
}

export async function createServer(opts: { root: string; port: number }): Promise<ServerHandle> {
  const state = new FlowState()
  const db = new SqliteRunsDb(runsDbPath(opts.root))
  const executor = new Executor(db, publish)

  const started = performance.now()
  const report = await scan(opts.root)
  state.replace(report, Math.round(performance.now() - started))

  const { server, address } = await listen(buildApp(state, db, executor), opts.port)

  return {
    url: `http://${HOST}:${address.port}`,
    setState: (next, synthMs) => state.replace(next, synthMs ?? 0),
    close: async () => {
      await shutdown(server)
      db.close()
    },
  }
}
