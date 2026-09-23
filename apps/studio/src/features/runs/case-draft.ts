import type { ApiExecution, ApiRunSnapshot } from "@/domain"
import type { BlobText } from "@/features/call-sheet"
import { runRef } from "@/lib/format"
import type { DatasetItem } from "./expected"
import { refValue } from "./run-diff"

export type CaseDraft = {
  readonly name: string
  readonly inputs: unknown
  readonly context: Readonly<Record<string, string>> | null
  readonly nodeOutputs: Readonly<Record<string, unknown>> | null
  readonly tags: Readonly<Record<string, string>>
}

export type CaseTarget = {
  readonly flowId: string
  readonly runId: string
  readonly item: DatasetItem | null
}

type YamlValue = unknown

const INDENT = "  "
const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
const NAME_PREFIX = "run_"
const REF_MARK = /^#/

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isTopLevel = (execution: ApiExecution, order: ReadonlySet<string>): boolean =>
  order.has(execution.address.node_id) &&
  execution.address.branch_key === null &&
  execution.address.iteration === null &&
  execution.address.item_index === null

const contextOf = (context: ApiRunSnapshot["context"]): Readonly<Record<string, string>> | null => {
  if (context === null) return null
  const entries = Object.entries(context).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  return entries.length === 0 ? null : Object.fromEntries(entries)
}

const nodeOutputsOf = (snapshot: ApiRunSnapshot, blobs: readonly BlobText[]): Readonly<Record<string, unknown>> | null => {
  const recorded = Object.entries(snapshot.node_outputs ?? {})
  const order = new Set(snapshot.order)
  const produced = snapshot.executions
    .filter((execution) => isTopLevel(execution, order) && execution.status === "ok" && execution.output_ref !== null)
    .map((execution) => [execution.address.node_id, refValue(execution.output_ref, blobs)] as const)
    .filter((entry) => entry[1] !== undefined)
  const entries = [...recorded, ...produced]
  return entries.length === 0 ? null : Object.fromEntries(entries)
}

export const caseNameOf = (runId: string): string => `${NAME_PREFIX}${runRef(runId).replace(REF_MARK, "")}`

export const draftCase = (snapshot: ApiRunSnapshot, blobs: readonly BlobText[]): CaseDraft => ({
  name: caseNameOf(snapshot.run_id),
  inputs: refValue(snapshot.input_ref, blobs) ?? null,
  context: contextOf(snapshot.context),
  nodeOutputs: nodeOutputsOf(snapshot, blobs),
  tags: { source_run: snapshot.run_id },
})

const keyText = (key: string): string => (PLAIN_KEY.test(key) ? key : JSON.stringify(key))

const scalarText = (value: YamlValue): string => (value === null || value === undefined ? "null" : JSON.stringify(value))

const emptyText = (value: YamlValue): string | null => {
  if (Array.isArray(value) && value.length === 0) return "[]"
  if (isRecord(value) && Object.keys(value).length === 0) return "{}"
  return null
}

const isBlock = (value: YamlValue): boolean => (Array.isArray(value) || isRecord(value)) && emptyText(value) === null

function mappingLines(value: Readonly<Record<string, unknown>>, indent: string): readonly string[] {
  return Object.entries(value).flatMap(([key, item]) => {
    if (!isBlock(item)) return [`${indent}${keyText(key)}: ${emptyText(item) ?? scalarText(item)}`]
    return [`${indent}${keyText(key)}:`, ...blockLines(item, Array.isArray(item) ? indent : `${indent}${INDENT}`)]
  })
}

function sequenceLines(value: readonly unknown[], indent: string): readonly string[] {
  return value.flatMap((item) => {
    if (!isBlock(item)) return [`${indent}- ${emptyText(item) ?? scalarText(item)}`]
    const [first = "", ...rest] = blockLines(item, `${indent}${INDENT}`)
    return [`${indent}- ${first.slice(indent.length + INDENT.length)}`, ...rest]
  })
}

function blockLines(value: YamlValue, indent: string): readonly string[] {
  if (Array.isArray(value)) return sequenceLines(value, indent)
  if (isRecord(value)) return mappingLines(value, indent)
  return [`${indent}${scalarText(value)}`]
}

const caseRecord = (draft: CaseDraft): Readonly<Record<string, unknown>> => ({
  name: draft.name,
  inputs: draft.inputs,
  ...(draft.context === null ? {} : { context: draft.context }),
  ...(draft.nodeOutputs === null ? {} : { node_outputs: draft.nodeOutputs }),
  tags: draft.tags,
})

export const caseYaml = (draft: CaseDraft): string => ["cases:", ...sequenceLines([caseRecord(draft)], "")].join("\n")

const targetLine = (target: CaseTarget): string =>
  target.item === null
    ? `Add it to a dataset of flow ${target.flowId}: use the dataset file the flow already has under datasets/, or create datasets/${target.flowId}_cases.yaml with apiVersion "aqven/v1", kind "Dataset" and flow "${target.flowId}".`
    : `Add it to the dataset file datasets/${target.item.datasetId}.yaml of flow ${target.flowId}; the run came from its case ${target.item.caseName}.`

export const toCasesPrompt = (target: CaseTarget, yaml: string): string => [
  `Turn run ${target.runId} of flow ${target.flowId} into a dataset case.`,
  targetLine(target),
  "Here is the draft built from the run input, its context and the outputs of its top-level nodes:",
  "```yaml",
  yaml,
  "```",
  "Keep only the node_outputs this case needs, give the case a descriptive name and meaningful tags, and ask me for expected_output before you write it.",
  "Run aqven check and report the result in this chat.",
].join("\n")
