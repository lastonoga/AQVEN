import type { ApiExecution, ApiExecutionAddress, ApiItemRecovery, ApiNode, ApiPromptDetail, ApiRunEvent, NodeKind } from "@/domain"
import { plainLines } from "@/lib/text"
import type {
  AttemptLadder,
  AttemptRow,
  CallColumn,
  CheckCell,
  CheckFinding,
  Coordinate,
  ExitSummary,
  InputCell,
  MatrixGroup,
  NestedBlock,
  PromptCell,
  RecoveryCell,
  RowKey,
  RowSpec,
  StageRun,
  TraceRun,
  UpstreamRef,
} from "./model"
import { ROW_KEYS } from "./model"
import { policyName, recoveredItems, recoveryOf, type RecoveredItem } from "./recovery"
import { valueCell } from "./values"

export type TraceSources = {
  readonly executions: readonly ApiExecution[]
  readonly order: readonly string[]
  readonly nodes: readonly ApiNode[]
  readonly prompts: Readonly<Record<string, ApiPromptDetail>>
  readonly events: readonly ApiRunEvent[]
  readonly blobTextById?: ReadonlyMap<string, string>
}

type Index = {
  readonly nodeById: ReadonlyMap<string, ApiNode>
  readonly childrenOf: ReadonlyMap<string, readonly ApiExecution[]>
  readonly byNodeId: ReadonlyMap<string, readonly ApiExecution[]>
  readonly ladders: ReadonlyMap<string, readonly AttemptRow[]>
  readonly responses: ReadonlyMap<string, string>
  readonly exits: ReadonlyMap<string, ExitSummary>
  readonly prompts: Readonly<Record<string, ApiPromptDetail>>
  readonly capturedPrompts: ReadonlyMap<string, Extract<ApiRunEvent, { type: "inference_prompt_captured" }>["prompt"]>
  readonly blobTextById: ReadonlyMap<string, string>
  readonly recovered: readonly RecoveredItem[]
}

type RowFilled = (columns: readonly CallColumn[]) => boolean

const KEY_SEPARATOR = "|"
const NESTED_SEPARATOR = "__"

const push = <T>(groups: Map<string, T[]>, key: string, value: T): void => {
  const bucket = groups.get(key)
  if (bucket === undefined) {
    groups.set(key, [value])
    return
  }
  bucket.push(value)
}

export const executionKey = (address: ApiExecutionAddress): string =>
  [address.node_id, address.branch_key ?? "", address.iteration ?? "", address.item_index ?? ""].join(KEY_SEPARATOR)

const attemptKey = (address: ApiExecutionAddress, attempt: number): string => `${executionKey(address)}#${String(attempt)}`

const scopes = (parent: ApiExecutionAddress, child: ApiExecutionAddress): boolean =>
  (parent.branch_key === null || parent.branch_key === child.branch_key) &&
  (parent.iteration === null || parent.iteration === child.iteration) &&
  (parent.item_index === null || parent.item_index === child.item_index)

export const coordinateOf = (address: ApiExecutionAddress): Coordinate | null => {
  if (address.branch_key !== null) return { kind: "branch", value: address.branch_key }
  if (address.iteration !== null) return { kind: "iteration", value: String(address.iteration) }
  if (address.item_index !== null) return { kind: "item", value: String(address.item_index) }
  return null
}

const localName = (node: ApiNode | undefined, nodeId: string): string =>
  node?.local_id ?? nodeId.split(NESTED_SEPARATOR).at(-1) ?? nodeId

const enclosingName = (nodeId: string): string | null => {
  const name = nodeId.split(NESTED_SEPARATOR).slice(0, -1).join(NESTED_SEPARATOR)
  return name.length === 0 ? null : name
}

const parentIdOf = (nodeId: string, nodeById: ReadonlyMap<string, ApiNode>): string | null => {
  const known = nodeById.get(nodeId)
  if (known !== undefined) return known.parent
  return enclosingName(nodeId)
}

const decimal = (raw: string): number => {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

const attemptRow = (event: Extract<ApiRunEvent, { type: "node_attempt_failed" }>): AttemptRow => ({
  attempt: event.attempt,
  kind: event.cause.kind,
  code: event.cause.code ?? null,
  action: event.action,
  message: event.cause.message,
  hint: event.cause.hint ?? null,
  rawExcerpt: event.cause.details?.raw_excerpt ?? null,
  problems: event.cause.schema_errors,
})

const ladderIndex = (events: readonly ApiRunEvent[]): ReadonlyMap<string, readonly AttemptRow[]> => {
  const rows = new Map<string, AttemptRow[]>()
  events.forEach((event) => {
    if (event.type !== "node_attempt_failed") return
    push(rows, executionKey(event.address), attemptRow(event))
  })
  return rows
}

const responseIndex = (events: readonly ApiRunEvent[]): ReadonlyMap<string, string> => {
  const parts = new Map<string, string[]>()
  const best = new Map<string, number>()
  events.forEach((event) => {
    if (event.type !== "node_output_delta") return
    const key = executionKey(event.address)
    best.set(key, Math.max(best.get(key) ?? 0, event.attempt))
    push(parts, attemptKey(event.address, event.attempt), event.delta)
  })
  const responses = new Map<string, string>()
  best.forEach((attempt, key) => {
    const chunks = parts.get(`${key}#${String(attempt)}`) ?? []
    if (chunks.length > 0) responses.set(key, chunks.join(""))
  })
  return responses
}

const exitIndex = (events: readonly ApiRunEvent[]): ReadonlyMap<string, ExitSummary> => {
  const scores = new Map<string, (number | null)[]>()
  events.forEach((event) => {
    if (event.type !== "loop_iteration_finished") return
    push(scores, event.address.node_id, event.score)
  })
  const exits = new Map<string, ExitSummary>()
  events.forEach((event) => {
    if (event.type !== "loop_exited") return
    exits.set(event.address.node_id, {
      reason: event.reason,
      selectedIteration: event.selected_iteration,
      scores: scores.get(event.address.node_id) ?? [],
    })
  })
  return exits
}

const capturedPromptIndex = (events: readonly ApiRunEvent[]) => {
  const captured = new Map<string, Extract<ApiRunEvent, { type: "inference_prompt_captured" }>["prompt"]>()
  events.forEach((event) => {
    if (event.type === "inference_prompt_captured") captured.set(executionKey(event.address), event.prompt)
  })
  return captured
}

const indexOf = (sources: TraceSources): Index => {
  const nodeById = new Map(sources.nodes.map((node) => [node.node_id, node]))
  const byNodeId = new Map<string, ApiExecution[]>()
  sources.executions.forEach((execution) => {
    push(byNodeId, execution.address.node_id, execution)
  })
  const childrenOf = new Map<string, ApiExecution[]>()
  sources.executions.forEach((execution) => {
    const parentId = parentIdOf(execution.address.node_id, nodeById)
    if (parentId === null) return
    const parent = (byNodeId.get(parentId) ?? []).find((candidate) => scopes(candidate.address, execution.address))
    if (parent === undefined) return
    push(childrenOf, executionKey(parent.address), execution)
  })
  return {
    nodeById,
    childrenOf,
    byNodeId,
    ladders: ladderIndex(sources.events),
    responses: responseIndex(sources.events),
    exits: exitIndex(sources.events),
    prompts: sources.prompts,
    capturedPrompts: capturedPromptIndex(sources.events),
    blobTextById: sources.blobTextById ?? new Map(),
    recovered: recoveredItems(sources.executions),
  }
}

const indexedValue = (ref: ApiExecution["output_ref"], index: Index) =>
  valueCell(ref, ref?.kind === "blob" ? index.blobTextById.get(ref.blob_id) : undefined)

const promptCell = (execution: ApiExecution, index: Index): PromptCell | null => {
  const detail = index.prompts[execution.address.node_id]
  const captured = index.capturedPrompts.get(executionKey(execution.address))
  if (execution.kind !== "llm" && captured === undefined) return null
  const text = captured?.messages.map((message) => [message.role.toUpperCase(),
    ...message.parts.map((part) => part.kind === "text" ? part.text ?? "" : `[${part.kind}]`)].join("\n")).join("\n\n") ?? ""
  return {
    kind: captured === undefined ? "missing" : "captured",
    inference: execution.inference ?? detail?.inference_id ?? null,
    level: captured?.level ?? detail?.level ?? null,
    lines: text.length === 0 ? [] : plainLines(text),
  }
}

const isDescendant = (nodeId: string, ancestorId: string): boolean => nodeId.startsWith(`${ancestorId}${NESTED_SEPARATOR}`)

const upstreamRef = (nodeId: string, address: ApiExecutionAddress, index: Index): UpstreamRef => {
  const candidates = index.byNodeId.get(nodeId) ?? []
  const scoped = candidates.find((candidate) => scopes(candidate.address, address)) ?? candidates.at(0)
  return { nodeId, cell: indexedValue(scoped?.output_ref ?? null, index) }
}

const inputCell = (execution: ApiExecution, index: Index, leaf: boolean): InputCell | null => {
  const recorded = indexedValue(execution.input_ref, index)
  if (recorded !== null) return { kind: "recorded", value: recorded }
  if (!leaf) return null
  const nodeId = execution.address.node_id
  const upstream = (index.nodeById.get(nodeId)?.upstream ?? []).filter(
    (id) => id !== nodeId && !isDescendant(id, nodeId) && index.byNodeId.has(id),
  )
  if (upstream.length === 0) return null
  return { kind: "upstream", refs: upstream.map((id) => upstreamRef(id, execution.address, index)) }
}

const schemaFindings = (row: AttemptRow): readonly CheckFinding[] =>
  row.problems.map((problem) => ({ name: problem.path.join("."), pass: false, note: problem.message, attempt: row.attempt }))

const attemptFindings = (rows: readonly AttemptRow[]): readonly CheckFinding[] =>
  rows.flatMap((row) => [{ name: row.code ?? row.kind, pass: false, note: row.message, attempt: row.attempt }, ...schemaFindings(row)])

const checkCell = (execution: ApiExecution, index: Index): CheckCell | null => {
  const rows = index.ladders.get(executionKey(execution.address)) ?? []
  if (rows.length === 0) return null
  return { findings: attemptFindings(rows), rules: [], failedAttempts: rows.length }
}

const recoveryCell = (recovery: ApiItemRecovery, index: Index): RecoveryCell => ({
  decision: recovery.decision,
  policy: policyName(recovery.policy),
  value: indexedValue(recovery.default_ref, index),
})

const columnRecovery = (execution: ApiExecution, index: Index): RecoveryCell | null => {
  const recovery = recoveryOf(index.recovered, execution)
  return recovery === null ? null : recoveryCell(recovery, index)
}

function nestedBlock(execution: ApiExecution, index: Index, path: string): NestedBlock | null {
  const children = index.childrenOf.get(executionKey(execution.address)) ?? []
  if (children.length === 0) return null
  const kind = index.nodeById.get(execution.address.node_id)?.kind ?? execution.kind
  const groups = groupsOf(children, kind, index, path)
  const group = groups.at(0)
  if (group === undefined) return null
  return { kind, fanOut: children.length, group }
}

function columnOf(execution: ApiExecution, index: Index, path: string): CallColumn {
  const id = `${path}/${executionKey(execution.address)}`
  const node = index.nodeById.get(execution.address.node_id)
  const child = nestedBlock(execution, index, id)
  return {
    id,
    address: execution.address,
    name: localName(node, execution.address.node_id),
    kind: execution.kind,
    status: execution.status,
    summary: execution.summary,
    coordinate: coordinateOf(execution.address),
    agent: {
      agent: execution.agent ?? node?.agent ?? null,
      model: execution.model,
      inference: execution.inference ?? node?.inference ?? null,
      profile: execution.profile,
      costUsd: decimal(execution.cost_usd),
      latencyMs: execution.latency_ms,
      tokensIn: execution.tokens_in,
      tokensOut: execution.tokens_out,
      cacheHit: execution.cache_hit,
      degraded: execution.degraded,
    },
    input: inputCell(execution, index, child === null),
    prompt: promptCell(execution, index),
    output: indexedValue(execution.output_ref, index),
    rawResponse: index.responses.get(executionKey(execution.address)) ?? null,
    check: checkCell(execution, index),
    recovery: columnRecovery(execution, index),
    child,
  }
}

const ROW_FILLED: Readonly<Record<RowKey, RowFilled>> = {
  call: () => true,
  agent: (columns) => columns.some((column) => column.agent.agent !== null || column.agent.inference !== null),
  model: () => true,
  input: (columns) => columns.some((column) => column.input !== null),
  prompt: (columns) => columns.some((column) => column.prompt !== null),
  output: (columns) => columns.some((column) => column.output !== null || column.recovery !== null),
  postCheck: (columns) => columns.some((column) => column.check !== null),
}

const rowsOf = (columns: readonly CallColumn[]): readonly RowSpec[] =>
  ROW_KEYS.filter((key) => ROW_FILLED[key](columns)).map((key) => ({ key }))

const byIteration = (left: ApiExecution, right: ApiExecution): number =>
  (left.address.iteration ?? 0) - (right.address.iteration ?? 0)

function groupOf(executions: readonly ApiExecution[], kind: NodeKind, index: Index, path: string): MatrixGroup {
  const columns = [...executions].sort(byIteration).map((execution) => columnOf(execution, index, path))
  return { id: path, kind, rows: rowsOf(columns), columns }
}

function groupsOf(executions: readonly ApiExecution[], kind: NodeKind, index: Index, path: string): readonly MatrixGroup[] {
  return [groupOf(executions, kind, index, path)]
}

const ladderLabel = (column: CallColumn): string =>
  column.coordinate === null ? column.name : `${column.name} ${column.coordinate.kind} ${column.coordinate.value}`

const laddersOf = (groups: readonly MatrixGroup[], index: Index): readonly AttemptLadder[] =>
  groups
    .flatMap((group) => group.columns)
    .flatMap((column) => {
      const attempts = index.ladders.get(executionKey(column.address)) ?? []
      if (attempts.length === 0) return []
      return [{ columnId: column.id, callLabel: ladderLabel(column), attempts }]
    })

const stageOf = (execution: ApiExecution, ordinal: number, index: Index): StageRun => {
  const key = executionKey(execution.address)
  const children = index.childrenOf.get(key) ?? []
  const kind = execution.kind
  const groups = groupsOf(children.length === 0 ? [execution] : children, kind, index, key)
  return {
    id: key,
    ordinal,
    nodeId: execution.address.node_id,
    kind,
    status: execution.status,
    costUsd: decimal(execution.cost_usd),
    latencyMs: execution.latency_ms,
    fanOut: children.length,
    groups,
    ladders: laddersOf(groups, index),
    recoveries: execution.recovered_items.map((recovery) => recoveryCell(recovery, index)),
    exit: index.exits.get(execution.address.node_id) ?? null,
  }
}

export const buildTrace = (sources: TraceSources): TraceRun => {
  const index = indexOf(sources)
  const started = new Set(sources.executions.map((execution) => execution.address.node_id))
  const stages = sources.order
    .flatMap((nodeId) => index.byNodeId.get(nodeId) ?? [])
    .filter((execution) => parentIdOf(execution.address.node_id, index.nodeById) === null)
    .map((execution, position) => stageOf(execution, position + 1, index))
  return { stages, pending: sources.order.filter((nodeId) => !started.has(nodeId)) }
}
