import type { ApiExecution, ApiRunEvent, ApiRunSnapshot, ApiValueRef, ExecutionStatus, RunStatus } from "@/domain"
import type { BlobText } from "@/features/call-sheet"
import { coordinateOf, executionKey, valueCell } from "@/features/trace"
import { decimalNumber, elapsedMs } from "./presenters"
import { changedFields, diffValues, type FieldDiff, type FieldState } from "./value-diff"

export type RunComparison = {
  readonly snapshot: ApiRunSnapshot
  readonly events: readonly ApiRunEvent[]
}

export type RunSide = {
  readonly snapshot: ApiRunSnapshot
  readonly events: readonly ApiRunEvent[]
  readonly blobs: readonly BlobText[]
}

export type CheckFact = { readonly name: string; readonly passed: boolean }

export type ExecutionFacts = {
  readonly status: ExecutionStatus
  readonly agent: string | null
  readonly model: string | null
  readonly costUsd: number
  readonly checks: readonly CheckFact[]
  readonly failedAttempts: number
}

export const FACT_ASPECTS = ["status", "model", "cost", "checks"] as const

export type FactAspect = (typeof FACT_ASPECTS)[number]

const DECISIVE_FACTS: readonly FactAspect[] = ["status", "model", "checks"]

export type NodeDiff = {
  readonly key: string
  readonly nodeId: string
  readonly coordinate: string | null
  readonly left: ExecutionFacts | null
  readonly right: ExecutionFacts | null
  readonly facts: Readonly<Record<FactAspect, FieldState>>
  readonly input: readonly FieldDiff[]
  readonly output: readonly FieldDiff[]
  readonly sameInput: number
  readonly sameOutput: number
  readonly changed: boolean
}

export type RunTotals = {
  readonly status: RunStatus
  readonly costUsd: number
  readonly durationMs: number | null
  readonly tokensIn: number
  readonly tokensOut: number
}

export type RunDiff = {
  readonly nodes: readonly NodeDiff[]
  readonly changedNodes: readonly NodeDiff[]
  readonly sameNodes: readonly NodeDiff[]
  readonly output: readonly FieldDiff[]
  readonly sameOutput: number
  readonly left: RunTotals
  readonly right: RunTotals
}

type ExecutionValues = {
  readonly facts: ExecutionFacts
  readonly input: unknown
  readonly output: unknown
}

type SideIndex = ReadonlyMap<string, ExecutionValues>

type ChecksEvent = Extract<ApiRunEvent, { type: "inference_checks_captured" }>

const blobText = (ref: ApiValueRef | null, blobs: readonly BlobText[]): string | undefined =>
  ref?.kind === "blob" ? blobs.find((blob) => blob.blobId === ref.blob_id)?.text : undefined

export const refValue = (ref: ApiValueRef | null, blobs: readonly BlobText[]): unknown =>
  valueCell(ref, blobText(ref, blobs))?.value

const latestChecks = (events: readonly ApiRunEvent[], key: string): readonly CheckFact[] => {
  const captured = events.filter((event): event is ChecksEvent => event.type === "inference_checks_captured" && executionKey(event.address) === key)
  const last = captured.at(-1)
  if (last === undefined) return []
  const attempt = Math.max(...last.checks.map((check) => check.attempt))
  return last.checks.filter((check) => check.attempt === attempt).map((check) => ({ name: check.check, passed: check.passed }))
}

const failedAttemptsOf = (events: readonly ApiRunEvent[], key: string): number =>
  events.filter((event) => event.type === "node_attempt_failed" && executionKey(event.address) === key).length

const valuesOf = (execution: ApiExecution, side: RunSide): ExecutionValues => {
  const key = executionKey(execution.address)
  return {
    facts: {
      status: execution.status,
      agent: execution.agent,
      model: execution.model,
      costUsd: decimalNumber(execution.cost_usd),
      checks: latestChecks(side.events, key),
      failedAttempts: failedAttemptsOf(side.events, key),
    },
    input: refValue(execution.input_ref, side.blobs),
    output: refValue(execution.output_ref, side.blobs),
  }
}

const indexOf = (side: RunSide): SideIndex =>
  new Map(side.snapshot.executions.map((execution) => [executionKey(execution.address), valuesOf(execution, side)]))

const orderedAddresses = (left: RunSide, right: RunSide): readonly ApiExecution[] => {
  const seen = new Set(left.snapshot.executions.map((execution) => executionKey(execution.address)))
  return [...left.snapshot.executions, ...right.snapshot.executions.filter((execution) => !seen.has(executionKey(execution.address)))]
}

const compareFact = <T>(left: T | undefined, right: T | undefined, identity: (value: T) => string): FieldState => {
  if (left === undefined) return "onlyRight"
  if (right === undefined) return "onlyLeft"
  return identity(left) === identity(right) ? "same" : "changed"
}

const FACT_IDENTITY: Readonly<Record<FactAspect, (facts: ExecutionFacts) => string>> = {
  status: (facts) => facts.status,
  model: (facts) => `${facts.agent ?? ""}|${facts.model ?? ""}`,
  cost: (facts) => facts.costUsd.toFixed(6),
  checks: (facts) => JSON.stringify([facts.checks, facts.failedAttempts]),
}

const factStates = (left: ExecutionFacts | undefined, right: ExecutionFacts | undefined): Readonly<Record<FactAspect, FieldState>> => ({
  status: compareFact(left, right, FACT_IDENTITY.status),
  model: compareFact(left, right, FACT_IDENTITY.model),
  cost: compareFact(left, right, FACT_IDENTITY.cost),
  checks: compareFact(left, right, FACT_IDENTITY.checks),
})

const coordinateText = (execution: ApiExecution): string | null => {
  const coordinate = coordinateOf(execution.address)
  return coordinate === null ? null : `${coordinate.kind} ${coordinate.value}`
}

const nodeDiff = (execution: ApiExecution, left: SideIndex, right: SideIndex): NodeDiff => {
  const key = executionKey(execution.address)
  const leftValues = left.get(key)
  const rightValues = right.get(key)
  const facts = factStates(leftValues?.facts, rightValues?.facts)
  const inputAll = diffValues(leftValues?.input, rightValues?.input)
  const outputAll = diffValues(leftValues?.output, rightValues?.output)
  const input = changedFields(inputAll)
  const output = changedFields(outputAll)
  return {
    key,
    nodeId: execution.address.node_id,
    coordinate: coordinateText(execution),
    left: leftValues?.facts ?? null,
    right: rightValues?.facts ?? null,
    facts,
    input,
    output,
    sameInput: inputAll.length - input.length,
    sameOutput: outputAll.length - output.length,
    changed: DECISIVE_FACTS.some((aspect) => facts[aspect] !== "same") || input.length > 0 || output.length > 0,
  }
}

const totalsOf = (snapshot: ApiRunSnapshot, now: Date): RunTotals => ({
  status: snapshot.status,
  costUsd: decimalNumber(snapshot.cost_usd),
  durationMs: elapsedMs(snapshot.started_at, snapshot.finished_at, now),
  tokensIn: snapshot.tokens_in,
  tokensOut: snapshot.tokens_out,
})

export const diffRuns = (left: RunSide, right: RunSide, now: Date): RunDiff => {
  const leftIndex = indexOf(left)
  const rightIndex = indexOf(right)
  const nodes = orderedAddresses(left, right).map((execution) => nodeDiff(execution, leftIndex, rightIndex))
  const outputAll = diffValues(refValue(left.snapshot.output_ref, left.blobs), refValue(right.snapshot.output_ref, right.blobs))
  const output = changedFields(outputAll)
  return {
    nodes,
    changedNodes: nodes.filter((node) => node.changed),
    sameNodes: nodes.filter((node) => !node.changed),
    output,
    sameOutput: outputAll.length - output.length,
    left: totalsOf(left.snapshot, now),
    right: totalsOf(right.snapshot, now),
  }
}
