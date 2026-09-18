import type { ApiExecutionDetail, ApiFlowSchemas, ApiNode, ApiPromptDetail, ApiRunEvent, ApiRunSnapshot } from "@/domain"
import { buildTrace, executionKey, type CallColumn, type TraceRun, type UpstreamRef } from "@/features/trace"
import type { BlobText, CallDetail, DisplayedSchema } from "@/features/call-sheet"

export type Prompts = Readonly<Record<string, ApiPromptDetail>>

export const traceOf = (
  snapshot: ApiRunSnapshot,
  nodes: readonly ApiNode[],
  prompts: Prompts,
  events: readonly ApiRunEvent[],
  blobs: readonly BlobText[] = [],
): TraceRun => buildTrace({
  executions: snapshot.executions,
  order: snapshot.order,
  nodes,
  prompts,
  events,
  blobTextById: new Map(blobs.map((blob) => [blob.blobId, blob.text])),
})

const allColumns = (trace: TraceRun | null): readonly CallColumn[] => {
  if (trace === null) return []
  const walk = (columns: readonly CallColumn[]): readonly CallColumn[] =>
    columns.flatMap((column) => [column, ...(column.child === null ? [] : walk(column.child.group.columns))])
  return trace.stages.flatMap((stage) => stage.groups.flatMap((group) => walk(group.columns)))
}

export const findColumn = (trace: TraceRun | null, key: string): CallColumn | null =>
  allColumns(trace).find((column) => executionKey(column.address) === key) ?? null

const upstreamOf = (column: CallColumn | null): readonly UpstreamRef[] =>
  column?.input?.kind === "upstream" ? column.input.refs : []

const displayedSchema = (schema: unknown, source: ApiExecutionDetail["schema_source"], current: unknown): DisplayedSchema => {
  if (schema !== null && schema !== undefined) return { schema, source }
  if (current !== null && current !== undefined) return { schema: current, source: "current" }
  return { schema: null, source: "unavailable" }
}

export const callDetail = (
  execution: ApiExecutionDetail,
  trace: TraceRun | null,
  prompts: Prompts,
  blobs: readonly BlobText[],
  schemas: ApiFlowSchemas,
): CallDetail => {
  const column = findColumn(trace, executionKey(execution.address))
  const selectedBlobIds = [execution.input_ref, execution.output_ref]
    .flatMap((ref) => ref?.kind === "blob" ? [ref.blob_id] : [])
  const current = schemas.nodes[execution.address.node_id]
  return {
    execution,
    inputSchema: displayedSchema(execution.input_schema, execution.schema_source, current?.in),
    outputSchema: displayedSchema(execution.output_schema, execution.schema_source, current?.out),
    prompt: prompts[execution.address.node_id] ?? null,
    rawResponse: column?.rawResponse ?? null,
    upstream: upstreamOf(column),
    blobs: blobs.filter((blob) => selectedBlobIds.includes(blob.blobId)),
  }
}
