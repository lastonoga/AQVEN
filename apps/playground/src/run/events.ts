import type { RunEvent, RunStatus } from "../api/index.js"

export type NodeStatus = "pending" | "running" | "ok" | "error" | "skipped"

export type NodeProgress = { index: number; total: number }

export type RunNodeView = {
  nodeId: string
  kind: string | null
  description: string | null
  status: NodeStatus
  order: number
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
  progress: NodeProgress | null
  simplifications: string[]
  slots: Record<string, unknown> | null
  input: unknown
  output: unknown
  outputType: string | null
  error: string | null
  events: RunEvent[]
}

export type RunView = {
  status: RunStatus
  startedAt: number | null
  endedAt: number | null
  durationMs: number | null
  nodes: RunNodeView[]
  simplifications: string[]
  input: unknown
  output: unknown
  outputType: string | null
  error: string | null
  unrecognized: RunEvent[]
}

type Draft = {
  status: RunStatus
  startedAt: number | null
  endedAt: number | null
  input: unknown
  output: unknown
  outputType: string | null
  error: string | null
  nodes: Map<string, RunNodeView>
  simplifications: string[]
  unrecognized: RunEvent[]
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null) return null
  if (Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const stringsOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []

const stringOf = (value: unknown): string | null => (typeof value === "string" ? value : null)

const numberOf = (value: unknown): number | null => (typeof value === "number" ? value : null)

const statusOf = (value: unknown): RunStatus => (value === "error" ? "error" : "ok")

const nodeStatuses: Record<string, NodeStatus> = { ok: "ok", error: "error", skipped: "skipped" }

const blankNode = (nodeId: string, order: number): RunNodeView => ({
  nodeId,
  kind: null,
  description: null,
  status: "pending",
  order,
  startedAt: null,
  endedAt: null,
  durationMs: null,
  progress: null,
  simplifications: [],
  slots: null,
  input: undefined,
  output: undefined,
  outputType: null,
  error: null,
  events: [],
})

const nodeOf = (draft: Draft, nodeId: string): RunNodeView => {
  const existing = draft.nodes.get(nodeId)
  if (existing !== undefined) return existing
  const created = blankNode(nodeId, draft.nodes.size)
  draft.nodes.set(nodeId, created)
  return created
}

const addUnique = (target: string[], items: string[]): void => {
  for (const item of items) {
    if (!target.includes(item)) target.push(item)
  }
}

const durationOf = (node: RunNodeView, payload: Record<string, unknown> | null, at: number): number | null => {
  const declared = numberOf(payload?.["ms"])
  if (declared !== null) return declared
  if (node.startedAt === null) return null
  return at - node.startedAt
}

type Handler = (draft: Draft, event: RunEvent, payload: Record<string, unknown> | null) => void

const seedOrder = (draft: Draft, payload: Record<string, unknown> | null): void => {
  for (const nodeId of stringsOf(payload?.["order"])) nodeOf(draft, nodeId)
}

const handlers: Record<string, Handler> = {
  run_start: (draft, event, payload) => {
    draft.status = "running"
    draft.startedAt = event.at
    draft.input = payload?.["input"]
    seedOrder(draft, payload)
  },
  node_start: (draft, event, payload) => {
    if (event.nodeId === undefined) return
    const node = nodeOf(draft, event.nodeId)
    node.status = "running"
    node.startedAt = event.at
    node.kind = stringOf(payload?.["kind"]) ?? node.kind
    node.description = stringOf(payload?.["description"]) ?? node.description
    node.slots = asRecord(payload?.["slots"])
    node.input = payload?.["inputs"]
  },
  node_progress: (draft, event, payload) => {
    if (event.nodeId === undefined) return
    const node = nodeOf(draft, event.nodeId)
    const index = numberOf(payload?.["index"])
    const total = numberOf(payload?.["total"])
    if (index === null || total === null) return
    node.progress = { index: index + 1, total }
  },
  node_finish: (draft, event, payload) => {
    if (event.nodeId === undefined) return
    const node = nodeOf(draft, event.nodeId)
    node.status = nodeStatuses[String(payload?.["status"] ?? "ok")] ?? "ok"
    node.endedAt = event.at
    node.durationMs = durationOf(node, payload, event.at)
    node.kind = stringOf(payload?.["kind"]) ?? node.kind
    node.output = payload?.["output"]
    node.outputType = stringOf(payload?.["outputType"])
    node.progress = null
  },
  node_fail: (draft, event, payload) => {
    if (event.nodeId === undefined) return
    const node = nodeOf(draft, event.nodeId)
    node.status = "error"
    node.endedAt = event.at
    node.durationMs = durationOf(node, payload, event.at)
    node.error = stringOf(payload?.["message"]) ?? stringOf(payload?.["error"]) ?? "узел упал без сообщения"
    draft.error = node.error
    draft.status = "error"
  },
  run_finish: (draft, event, payload) => {
    draft.status = statusOf(payload?.["status"])
    draft.endedAt = event.at
    draft.output = payload?.["output"]
    draft.outputType = stringOf(payload?.["outputType"])
  },
}

const apply = (draft: Draft, event: RunEvent): void => {
  const payload = asRecord(event.payload)
  const simplifications = stringsOf(payload?.["simplifications"])
  addUnique(draft.simplifications, simplifications)

  if (event.nodeId !== undefined) {
    const node = nodeOf(draft, event.nodeId)
    node.events.push(event)
    addUnique(node.simplifications, simplifications)
  }

  const handler = handlers[event.type]
  if (handler === undefined) {
    draft.unrecognized.push(event)
    return
  }
  handler(draft, event, payload)
}

export const foldRun = (events: readonly RunEvent[], initial: RunStatus): RunView => {
  const draft: Draft = {
    status: initial,
    startedAt: null,
    endedAt: null,
    input: undefined,
    output: undefined,
    outputType: null,
    error: null,
    nodes: new Map(),
    simplifications: [],
    unrecognized: [],
  }
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) apply(draft, event)
  return {
    status: draft.status,
    startedAt: draft.startedAt,
    endedAt: draft.endedAt,
    durationMs: draft.startedAt === null || draft.endedAt === null ? null : draft.endedAt - draft.startedAt,
    nodes: [...draft.nodes.values()],
    simplifications: draft.simplifications,
    input: draft.input,
    output: draft.output,
    outputType: draft.outputType,
    error: draft.error,
    unrecognized: draft.unrecognized,
  }
}
