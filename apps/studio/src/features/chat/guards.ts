import type {
  AttemptCode,
  PatchSpecArgs,
  PatchSpecProgress,
  PatchSpecResult,
  ReadRunArgs,
  ReadRunResult,
  RunDatasetArgs,
  RunDatasetResult,
} from "@/domain"

type Check = (value: unknown) => boolean
type Shape = Readonly<Record<string, Check>>

export const ATTEMPT_CODES: readonly AttemptCode[] = ["http_429", "schema_invalid", "truncated", "fallback"]
const CALL_MODES: readonly RunDatasetResult["callMode"][] = ["live", "cassette"]
const PATCH_STATES: readonly PatchSpecResult["state"][] = ["draft", "applied", "reverted"]

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null

const isString: Check = (value) => typeof value === "string"
const isNumber: Check = (value) => typeof value === "number" && Number.isFinite(value)
const isBoolean: Check = (value) => typeof value === "boolean"
const rejects: Check = () => false

const oneOf =
  (options: readonly unknown[]): Check =>
  (value) =>
    options.includes(value)

const listOf =
  (item: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(item)

const nullable =
  (item: Check): Check =>
  (value) =>
    value === null || item(value)

const either =
  (...checks: readonly Check[]): Check =>
  (value) =>
    checks.some((check) => check(value))

const shapeOf =
  (shape: Shape): Check =>
  (value) =>
    isRecord(value) && Object.entries(shape).every(([key, check]) => check(value[key]))

const specChange = either(
  shapeOf({ kind: oneOf(["field"]), nodeId: isString, field: isString, from: isString, to: isString }),
  shapeOf({ kind: oneOf(["knowledge"]), knowledgeId: isString, from: isString, to: isString, note: isString }),
)

const datasetScore = shapeOf({ datasetId: isString, passed: isNumber, total: isNumber, costUsd: isNumber })

const readRunArgs = shapeOf({ runId: isString, nodeId: isString })
const readRunResult = shapeOf({
  attempts: listOf(oneOf(ATTEMPT_CODES)),
  billedUsd: isNumber,
  failedUsd: isNumber,
  callId: isString,
  columnId: isString,
})
const patchSpecArgs = shapeOf({ instruction: isString })
const patchSpecProgress = shapeOf({ target: isString, step: isNumber, totalSteps: isNumber })
const patchSpecResult = shapeOf({
  revision: isString,
  nodeCount: isNumber,
  changes: listOf(specChange),
  branchesAffected: isNumber,
  runEstimateUsd: isNumber,
  state: oneOf(PATCH_STATES),
})
const runDatasetArgs = shapeOf({ datasetId: isString })
const runDatasetResult = shapeOf({
  scores: listOf(datasetScore),
  callMode: oneOf(CALL_MODES),
  recordCassette: isBoolean,
  runId: nullable(isString),
})

export const NO_PROGRESS = (value: unknown): value is never => rejects(value)

export const isReadRunArgs = (value: unknown): value is ReadRunArgs => readRunArgs(value)

export const isReadRunResult = (value: unknown): value is ReadRunResult => readRunResult(value)

export const isPatchSpecArgs = (value: unknown): value is PatchSpecArgs => patchSpecArgs(value)

export const isPatchSpecProgress = (value: unknown): value is PatchSpecProgress => patchSpecProgress(value)

export const isPatchSpecResult = (value: unknown): value is PatchSpecResult => patchSpecResult(value)

export const isRunDatasetArgs = (value: unknown): value is RunDatasetArgs => runDatasetArgs(value)

export const isRunDatasetResult = (value: unknown): value is RunDatasetResult => runDatasetResult(value)
