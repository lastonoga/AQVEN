import type { ApiExecution, ApiExecutionAddress, ApiRunEvent, ApiRunSnapshot } from "@/domain"
import { COMPLETED_RUN_ID, liveRunEvents, liveRunSnapshots } from "@/mocks/data/runs"

type Listener = (event: Event) => void

export class FakeEventSource {
  static readonly opened: FakeEventSource[] = []
  readonly url: string
  closed = false
  private readonly listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.opened.push(this)
  }

  static reset(): void {
    FakeEventSource.opened.length = 0
  }

  static latest(): FakeEventSource {
    const source = FakeEventSource.opened.at(-1)
    if (source === undefined) throw new Error("no event source was opened")
    return source
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close(): void {
    this.closed = true
  }

  emit(event: ApiRunEvent): void {
    const message = new MessageEvent(event.type, { data: JSON.stringify(event) })
    this.listeners.get(event.type)?.forEach((listener) => {
      listener(message)
    })
  }
}

export const completedSnapshot = (): ApiRunSnapshot => {
  const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]
  if (snapshot === undefined) throw new Error("missing completed run fixture")
  return snapshot
}

export const completedEvents = (): readonly ApiRunEvent[] => liveRunEvents[COMPLETED_RUN_ID] ?? []

export const topAddress = (nodeId: string): ApiExecutionAddress => ({ node_id: nodeId, branch_key: null, iteration: null, item_index: null })

const AT = "2026-09-18T02:59:00Z"

export const execution = (nodeId: string, patch: Partial<ApiExecution> = {}): ApiExecution => ({
  address: topAddress(nodeId),
  kind: "llm",
  status: "ok",
  attempts_count: 1,
  started_at: "2026-09-18T02:00:00Z",
  finished_at: "2026-09-18T02:00:01Z",
  latency_ms: 1000,
  agent: "gpt",
  inference: nodeId,
  model: "openai/gpt-5",
  profile: null,
  cost_usd: "0.0100",
  tokens_in: 10,
  tokens_out: 20,
  cache_hit: false,
  degraded: false,
  summary: null,
  input_ref: { kind: "inline", value: { message: "lamp flickers" } },
  output_ref: { kind: "inline", value: { intent: "defect", tier: "strong" } },
  trace_id: null,
  span_id: null,
  ...patch,
})

export const nodeFinished = (runId: string, seq: number, nodeId: string): ApiRunEvent => ({
  seq,
  at: AT,
  run_id: runId,
  type: "node_finished",
  address: topAddress(nodeId),
  status: "ok",
  attempt: 1,
  output_ref: null,
  cost_usd: "0",
  tokens_in: 0,
  tokens_out: 0,
  latency_ms: 10,
  wait_ms: 0,
  model: null,
  cache_hit: false,
  degraded: false,
  checks_failed: 0,
})

export const runFinished = (runId: string, seq: number): ApiRunEvent => ({
  seq,
  at: AT,
  run_id: runId,
  type: "run_finished",
  status: "completed",
  output_ref: null,
  error: null,
  cost_usd: "0",
  tokens_in: 0,
  tokens_out: 0,
})

export const outputDelta = (runId: string, seq: number, nodeId: string, delta: string): ApiRunEvent => ({
  seq,
  at: AT,
  run_id: runId,
  type: "node_output_delta",
  address: topAddress(nodeId),
  attempt: 1,
  part_kind: "text",
  part_index: 0,
  delta,
  cumulative_length: delta.length,
})
