import type { ApiExecution, ApiExecutionAddress, ApiItemRecovery, ApiJsonObject, ApiRun, ApiRunEvent, ApiRunSnapshot } from "@/domain"

export const RECOVERED_RUN_ID = "01a0d310-5c2e-7a41-8f3d-6b1e0c9a4d27"

const FLOW_ID = "support_case"
const CONTENT_HASH = "sha256-1d6cd1dcac8472621e14b90be07aa0602ee3ccace830062172604028558882e5"
const STARTED_AT = "2026-09-17T19:40:02.114000Z"
const FINISHED_AT = "2026-09-17T19:41:52.730512Z"
const MODEL = "openrouter:meta-llama/llama-3.1-8b-instruct"
const ORDER = ["prepare", "vote", "tally"]
const FAILED_ITEM = 2
const PERSPECTIVES = ["words", "evidence", "risk", "history", "tone"]

const CHECK_MESSAGE = "check intent_in_allowed_set rejected the output: $out.intent: value outside the allowed set: refund_maybe"
const CHECK_HINT = "tighten the prompt or relax check intent_in_allowed_set in flows/support_case/nodes/vote/ballot.inference.yaml"

const address = (nodeId: string, itemIndex: number | null = null): ApiExecutionAddress => ({
  node_id: nodeId,
  branch_key: null,
  iteration: null,
  item_index: itemIndex,
})

const BALLOTS: readonly (ApiJsonObject | null)[] = [
  { rationale: "The customer describes a strip that flickers at the controller right after connecting it", intent: "defect", confidence: 0.82 },
  { rationale: "The photo shows a warm controller and a dented box, both point at a faulty unit", intent: "defect", confidence: 0.74 },
  null,
  { rationale: "The account has no earlier claims for this order, nothing suggests a repeat return", intent: "defect", confidence: 0.61 },
  { rationale: "The tone is polite and asks how to connect the controller, a usage question is possible", intent: "usage_question", confidence: 0.55 },
]

const ABSTAIN: ApiJsonObject = {
  rationale: "This perspective was not read: the model gave no valid ballot",
  intent: "abstain",
  confidence: 0,
}

const RECOVERY: ApiItemRecovery = {
  item_index: FAILED_ITEM,
  policy: "@root.code.vote_policies:abstain",
  decision: "default",
  error: {
    code: "MODEL_RETRIES_EXHAUSTED",
    message: `model ${MODEL} gave no valid output for agent ballot after 4 failed attempts; last error check_failed: ${CHECK_MESSAGE}`,
  },
  default_ref: { kind: "inline", value: ABSTAIN },
}

const base = (nodeId: string, kind: ApiExecution["kind"], output: ApiJsonObject | null): ApiExecution => ({
  address: address(nodeId),
  kind,
  status: "ok",
  attempts_count: 1,
  started_at: STARTED_AT,
  finished_at: FINISHED_AT,
  latency_ms: 2,
  agent: null,
  inference: null,
  model: null,
  profile: null,
  cost_usd: "0",
  tokens_in: 0,
  tokens_out: 0,
  cache_hit: false,
  degraded: false,
  summary: null,
  input_ref: null,
  output_ref: output === null ? null : { kind: "inline", value: output },
  trace_id: null,
  span_id: null,
  recovered_items: [],
})

const ballot = (value: ApiJsonObject | null, index: number): ApiExecution => {
  const failed = value === null
  return {
    ...base("vote__ballot", "llm", value),
    address: address("vote__ballot", index),
    status: failed ? "failed" : "ok",
    attempts_count: failed ? 4 : 1,
    agent: "ballot",
    inference: "ballot",
    model: MODEL,
    latency_ms: failed ? 34_236 : 3_176 + index * 811,
    cost_usd: failed ? "0.00035" : "0.00036",
    tokens_in: 2_739,
    tokens_out: 218,
  }
}

const ballots = BALLOTS.map((value) => value ?? ABSTAIN)

const executions: ApiExecution[] = [
  base("prepare", "code", { perspectives: PERSPECTIVES }),
  {
    ...base("vote", "map", { ballots }),
    latency_ms: 34_305,
    cost_usd: "0.0018",
    degraded: true,
    recovered_items: [RECOVERY],
  },
  ...BALLOTS.map(ballot),
  base("tally", "code", { intent: "defect", agreement: "majority", confidence: 0.82 }),
]

export const recoveredRun: ApiRun = {
  run_id: RECOVERED_RUN_ID,
  flow_id: FLOW_ID,
  status: "completed",
  mode: "live",
  started_at: STARTED_AT,
  finished_at: FINISHED_AT,
  cost_usd: "0.0018",
  tokens_in: 13_695,
  tokens_out: 1_090,
  node_counts: { pending: 0, running: 0, ok: 7, failed: 1, skipped: 0, suspended: 0, cancelled: 0, items_replaced: 1, items_skipped: 0 },
  content_hash: CONTENT_HASH,
  definition_changed: false,
  waits: [],
  lineage: null,
}

export const recoveredRunSnapshot: ApiRunSnapshot = {
  ...recoveredRun,
  execution_id: RECOVERED_RUN_ID,
  context: null,
  spec_version: { id: CONTENT_HASH, content_hash: CONTENT_HASH, release_hash: null, git_commit: null, origin: "working_copy", sources: {} },
  input_ref: null,
  output_ref: { kind: "inline", value: { intent: "defect", agreement: "majority", confidence: 0.82 } },
  error: null,
  seed: null,
  cassette_id: null,
  catalog_snapshot_at: null,
  effective_config: {},
  config_hash: "",
  limits: null,
  trace_id: null,
  order: ORDER,
  executions,
  human_answers: [],
  last_seq: 9,
}

const answer = (keys: readonly string[]): string => {
  const fields: Readonly<Record<string, string | number>> = {
    rationale: "The customer may want a refund once the controller is replaced",
    intent: "refund_maybe",
    confidence: 0.4,
  }
  return JSON.stringify(Object.fromEntries(keys.map((key) => [key, fields[key] ?? null])))
}

const KEY_ORDERS: readonly (readonly string[])[] = [
  ["rationale", "intent", "confidence"],
  ["intent", "confidence", "rationale"],
  ["confidence", "rationale", "intent"],
]

const identicalAnswers = (count: number): string =>
  Array.from({ length: count }, (_, index) => answer(KEY_ORDERS[index % KEY_ORDERS.length] ?? [])).join("\n")

const DIFFERENT_ANSWERS = [
  answer(["rationale", "intent", "confidence"]),
  JSON.stringify({ rationale: "A refund could follow the replacement", intent: "refund_maybe", confidence: 0.3 }),
].join("\n")

const attemptFailed = (seq: number, attempt: number, rawExcerpt: string): ApiRunEvent => ({
  seq,
  at: FINISHED_AT,
  run_id: RECOVERED_RUN_ID,
  type: "node_attempt_failed",
  address: address("vote__ballot", FAILED_ITEM),
  attempt,
  cause: {
    kind: "schema_invalid",
    message: CHECK_MESSAGE,
    schema_errors: [],
    code: "check_failed",
    hint: CHECK_HINT,
    details: { agent: "ballot", model: MODEL, output_mode: "tool", attempt, raw_excerpt: rawExcerpt, violations: [] },
  },
  action: attempt === 4 ? "none" : "repair",
})

export const recoveredRunEvents: readonly ApiRunEvent[] = [
  {
    seq: 1,
    at: STARTED_AT,
    run_id: RECOVERED_RUN_ID,
    type: "run_started",
    flow_id: FLOW_ID,
    content_hash: CONTENT_HASH,
    mode: "live",
    order: ORDER,
    input_ref: null,
  },
  attemptFailed(2, 1, DIFFERENT_ANSWERS),
  attemptFailed(3, 2, identicalAnswers(14)),
  attemptFailed(4, 3, identicalAnswers(14)),
  attemptFailed(5, 4, identicalAnswers(14)),
  {
    seq: 6,
    at: FINISHED_AT,
    run_id: RECOVERED_RUN_ID,
    type: "map_item_recovered",
    address: address("vote"),
    recovery: RECOVERY,
  },
  {
    seq: 9,
    at: FINISHED_AT,
    run_id: RECOVERED_RUN_ID,
    type: "run_finished",
    status: "completed",
    output_ref: recoveredRunSnapshot.output_ref,
    error: null,
    cost_usd: "0.0018",
    tokens_in: 13_695,
    tokens_out: 1_090,
  },
]
