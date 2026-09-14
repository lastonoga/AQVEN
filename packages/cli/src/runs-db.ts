import { DatabaseSync } from "node:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { SQLOutputValue } from "node:sqlite"
import type { Run, RunEvent, RunStatus } from "./events.js"

export const DB_DIR = ".wf"
export const DB_FILE = "playground.db"

export type Render = {
  runId: string
  nodeId: string
  input: unknown
  output: unknown
  prompt: string | null
}

export type RunDetail = {
  run: Run
  events: RunEvent[]
  renders: Record<string, Render>
}

export type StoredBlob = {
  id: string
  runId: string
  nodeId: string
  mime: string
  name: string
  bytes: number
  body: Uint8Array
}

export type RunsRepository = {
  createRun(run: Run): void
  finishRun(id: string, status: RunStatus, endedAt: number): void
  appendEvent(runId: string, event: RunEvent): void
  saveRender(render: Render): void
  saveBlob(blob: StoredBlob): void
  findBlob(id: string): StoredBlob | null
  listRuns(limit: number): Run[]
  findRun(id: string): RunDetail | null
  close(): void
}

const DDL = `
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  flow TEXT NOT NULL,
  ir_hash TEXT,
  input TEXT,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS node_events (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  node_id TEXT,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  payload TEXT,
  PRIMARY KEY (run_id, seq)
);
CREATE TABLE IF NOT EXISTS renders (
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  input TEXT,
  output TEXT,
  prompt TEXT,
  PRIMARY KEY (run_id, node_id)
);
CREATE TABLE IF NOT EXISTS blobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  mime TEXT NOT NULL,
  name TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  body BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS node_events_run ON node_events (run_id, seq);
CREATE INDEX IF NOT EXISTS runs_started ON runs (started_at DESC);
CREATE INDEX IF NOT EXISTS blobs_run ON blobs (run_id);
`

const STATUSES = new Set<string>(["queued", "running", "ok", "error"])

const encode = (value: unknown): string | null => {
  const json = JSON.stringify(value ?? null)
  return json === undefined ? null : json
}

const decode = (value: SQLOutputValue): unknown => {
  if (typeof value !== "string") return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

type Row = Record<string, SQLOutputValue>

const text = (row: Row, key: string): string => {
  const value = row[key]
  return typeof value === "string" ? value : ""
}

const optText = (row: Row, key: string): string | undefined => {
  const value = row[key]
  return typeof value === "string" ? value : undefined
}

const int = (row: Row, key: string): number => Number(row[key] ?? 0)

const optInt = (row: Row, key: string): number | undefined => {
  const value = row[key]
  return value === null || value === undefined ? undefined : Number(value)
}

const statusOf = (row: Row): RunStatus => {
  const value = text(row, "status")
  return STATUSES.has(value) ? (value as RunStatus) : "error"
}

const toRun = (row: Row): Run => ({
  id: text(row, "id"),
  flow: text(row, "flow"),
  input: decode(row["input"] ?? null),
  status: statusOf(row),
  irHash: optText(row, "ir_hash"),
  startedAt: int(row, "started_at"),
  endedAt: optInt(row, "ended_at"),
})

const toEvent = (row: Row): RunEvent => ({
  seq: int(row, "seq"),
  at: int(row, "at"),
  type: text(row, "type"),
  nodeId: optText(row, "node_id"),
  payload: decode(row["payload"] ?? null),
})

const toRender = (row: Row): Render => ({
  runId: text(row, "run_id"),
  nodeId: text(row, "node_id"),
  input: decode(row["input"] ?? null),
  output: decode(row["output"] ?? null),
  prompt: optText(row, "prompt") ?? null,
})

const bodyOf = (row: Row): Uint8Array => {
  const value = row["body"]
  return value instanceof Uint8Array ? value : new Uint8Array()
}

const toBlob = (row: Row): StoredBlob => ({
  id: text(row, "id"),
  runId: text(row, "run_id"),
  nodeId: text(row, "node_id"),
  mime: text(row, "mime"),
  name: text(row, "name"),
  bytes: int(row, "bytes"),
  body: bodyOf(row),
})

export function runsDbPath(root: string): string {
  return join(resolve(root), DB_DIR, DB_FILE)
}

export class SqliteRunsDb implements RunsRepository {
  private readonly db: DatabaseSync

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec(DDL)
  }

  createRun(run: Run): void {
    this.db
      .prepare("INSERT INTO runs (id, flow, ir_hash, input, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(run.id, run.flow, run.irHash ?? null, encode(run.input), run.status, run.startedAt, run.endedAt ?? null)
  }

  finishRun(id: string, status: RunStatus, endedAt: number): void {
    this.db.prepare("UPDATE runs SET status = ?, ended_at = ? WHERE id = ?").run(status, endedAt, id)
  }

  appendEvent(runId: string, event: RunEvent): void {
    this.db
      .prepare("INSERT OR REPLACE INTO node_events (run_id, seq, node_id, type, at, payload) VALUES (?, ?, ?, ?, ?, ?)")
      .run(runId, event.seq, event.nodeId ?? null, event.type, event.at, encode(event.payload))
  }

  saveRender(render: Render): void {
    this.db
      .prepare("INSERT OR REPLACE INTO renders (run_id, node_id, input, output, prompt) VALUES (?, ?, ?, ?, ?)")
      .run(render.runId, render.nodeId, encode(render.input), encode(render.output), render.prompt)
  }

  saveBlob(blob: StoredBlob): void {
    this.db
      .prepare("INSERT OR REPLACE INTO blobs (id, run_id, node_id, mime, name, bytes, body) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(blob.id, blob.runId, blob.nodeId, blob.mime, blob.name, blob.bytes, blob.body)
  }

  findBlob(id: string): StoredBlob | null {
    const row = this.db.prepare("SELECT * FROM blobs WHERE id = ?").get(id)
    return row === undefined ? null : toBlob(row)
  }

  listRuns(limit: number): Run[] {
    return this.db
      .prepare("SELECT * FROM runs ORDER BY started_at DESC, rowid DESC LIMIT ?")
      .all(limit)
      .map(toRun)
  }

  findRun(id: string): RunDetail | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(id)
    if (row === undefined) return null

    const events = this.db.prepare("SELECT * FROM node_events WHERE run_id = ? ORDER BY seq").all(id).map(toEvent)
    const renders = this.db.prepare("SELECT * FROM renders WHERE run_id = ?").all(id).map(toRender)

    return {
      run: toRun(row),
      events,
      renders: Object.fromEntries(renders.map((r) => [r.nodeId, r])),
    }
  }

  close(): void {
    this.db.close()
  }
}
