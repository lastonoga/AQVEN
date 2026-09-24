import type { ApiExecution, ApiExecutionAddress, ApiExecutionDetail, ApiRunError, ApiRunEvent, ApiRunSnapshot } from "@/domain"
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

  static on(path: string): readonly FakeEventSource[] {
    return FakeEventSource.opened.filter((source) => source.url.startsWith(path))
  }

  static latestOn(path: string): FakeEventSource {
    const source = FakeEventSource.on(path).at(-1)
    if (source === undefined) throw new Error(`no event source was opened on ${path}`)
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
  cost_source: "provider",
  unpriced_calls: 0,
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

export const FACE_RUN_ID = "01a0d2f7-f0cf-7557-b783-f54a1cdca04e"

export const FACE_ITEMS = 5

const GEMINI_BODY = {
  message: "Provider returned error",
  code: 400,
  metadata: {
    raw: "{\n  \"error\": {\n    \"code\": 400,\n    \"message\": \"The specified schema produces a constraint that has too many states for serving.\",\n    \"status\": \"INVALID_ARGUMENT\"\n  }\n}\n",
    provider_name: "Google AI Studio",
    provider_error_code: "400",
  },
}

export const itemAddress = (nodeId: string, item: number): ApiExecutionAddress => ({ node_id: nodeId, branch_key: null, iteration: null, item_index: item })

export const schemaRejection: ApiRunError = {
  code: "OUTPUT_SCHEMA_REJECTED",
  message: "openrouter:google/gemini-2.5-flash-lite rejected the output type LookOut of step assess__look: The specified schema produces a constraint that has too many states for serving.",
  address: itemAddress("assess__look", 0),
  hint: "LookOut is too complex for the structured output of this model: deepest nesting findings[].zone (3 levels), largest maxItems findings (12), largest enum findings[].kind (16 values). Lower those limits or flatten the type in flows/face_review/nodes/assess/look.inference.yaml",
  details: {
    agent: "looker",
    model: "openrouter:google/gemini-2.5-flash-lite",
    output_mode: "tool",
    attempt: null,
    raw_excerpt: null,
    violations: [],
    status_code: 400,
    provider: "Google AI Studio",
    provider_code: "INVALID_ARGUMENT",
    provider_response: JSON.stringify(GEMINI_BODY),
    output_shape: { depth: 3, deepest_path: "findings[].zone", max_items: 12, max_items_path: "findings", enum_size: 16, enum_path: "findings[].kind" },
  },
}

export const legacyProviderError: ApiRunError = {
  code: "provider_error",
  message: `status_code: 400, model_name: google/gemini-2.5-flash-lite, body: ${JSON.stringify(GEMINI_BODY)} ${"previous_errors ".repeat(40)}`,
  address: itemAddress("assess__look", 0),
  hint: null,
  details: null,
}

const faceItem = (item: number): ApiExecution => execution("assess__look", {
  address: itemAddress("assess__look", item),
  status: item === 0 ? "failed" : "ok",
  agent: "looker",
  model: "openrouter:google/gemini-2.5-flash-lite",
  output_ref: item === 0 ? null : { kind: "inline", value: { view: "left_side", legible: true } },
})

const faceItems = (): readonly ApiExecution[] => Array.from({ length: FACE_ITEMS }, (_, item) => faceItem(item))

export const faceSnapshot = (): ApiRunSnapshot => ({
  ...completedSnapshot(),
  run_id: FACE_RUN_ID,
  flow_id: "face_review",
  status: "completed",
  mode: "live",
  node_counts: { pending: 0, running: 0, ok: FACE_ITEMS + 1, failed: 1, skipped: 0, suspended: 0, cancelled: 0 },
  lineage: null,
  dataset_item_id: null,
  selected_nodes: null,
  start_node: null,
  end_node: null,
  series_id: null,
  experiment_id: null,
  arm_id: null,
  waits: [],
  human_answers: [],
  input_ref: null,
  output_ref: null,
  error: null,
  order: ["assess"],
  executions: [execution("assess", { kind: "map", agent: null, model: null, input_ref: null, output_ref: null }), ...faceItems()],
  last_seq: FACE_ITEMS + 1,
})

type NodeFinishedEvent = Extract<ApiRunEvent, { type: "node_finished" }>

export const finishedAt = (runId: string, seq: number, address: ApiExecutionAddress, error: ApiRunError | null = null): NodeFinishedEvent => ({
  seq,
  at: AT,
  run_id: runId,
  type: "node_finished",
  address,
  status: error === null ? "ok" : "failed",
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
  error,
  cost_source: "provider",
  unpriced_calls: 0,
})

const itemFinished = (item: number): ApiRunEvent =>
  finishedAt(FACE_RUN_ID, item + 1, itemAddress("assess__look", item), item === 0 ? schemaRejection : null)

export const faceEvents = (): readonly ApiRunEvent[] => [
  ...Array.from({ length: FACE_ITEMS }, (_, item) => itemFinished(item)),
  nodeFinished(FACE_RUN_ID, FACE_ITEMS + 1, "assess"),
  runFinished(FACE_RUN_ID, FACE_ITEMS + 2),
]

export const faceDetail = (error: ApiRunError = schemaRejection): ApiExecutionDetail => ({
  ...faceItem(0),
  provenance: {},
  schema_source: "unavailable",
  allowed_sets: [],
  prompt: null,
  response: null,
  attempts: [],
  checks: [],
  rule_firings: [],
  error,
  human: null,
})
