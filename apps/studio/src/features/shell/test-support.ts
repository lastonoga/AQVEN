import type { ApiSeriesSummary, ApiSpecEvent } from "@/domain"

export type EventOf<T extends ApiSpecEvent["type"]> = Extract<ApiSpecEvent, { readonly type: T }>

const AT = "2026-09-24T10:00:00Z"
const TREE = "sha256-tree"
const FLOW = "support_case"

export const seriesStarted = (seq: number, series: string, experiment: string | null): EventOf<"series_started"> => ({
  type: "series_started",
  seq,
  at: AT,
  tree_hash: TREE,
  series_id: series,
  experiment_id: experiment,
  flow_id: FLOW,
  status: "running",
  total: 12,
})

export const startedFrom = (seq: number, summary: ApiSeriesSummary): EventOf<"series_started"> =>
  seriesStarted(seq, summary.series_id, summary.origin.kind === "experiment" ? summary.origin.experiment_id : null)

export const seriesProgressed = (seq: number, series: string, experiment: string | null): EventOf<"series_progress"> => ({
  type: "series_progress",
  seq,
  at: AT,
  tree_hash: TREE,
  series_id: series,
  experiment_id: experiment,
  flow_id: FLOW,
  done: 3,
  total: 12,
  spend_usd: "0.03",
})

export const seriesStatusChanged = (seq: number, series: string, experiment: string | null): EventOf<"series_status_changed"> => ({
  type: "series_status_changed",
  seq,
  at: AT,
  tree_hash: TREE,
  series_id: series,
  experiment_id: experiment,
  flow_id: FLOW,
  status: "waiting_human",
  previous: "running",
})

export const findingWritten = (seq: number, experiment: string, series: string, paths: readonly string[]): EventOf<"finding_written"> => ({
  type: "finding_written",
  seq,
  at: AT,
  tree_hash: TREE,
  experiment_id: experiment,
  series_id: series,
  paths: [...paths],
})

export const experimentChanged = (seq: number, experiment: string, paths: readonly string[]): EventOf<"experiment_changed"> => ({
  type: "experiment_changed",
  seq,
  at: AT,
  tree_hash: TREE,
  experiment_id: experiment,
  change: "modified",
  paths: [...paths],
})

export const filesChanged = (seq: number, paths: readonly string[]): EventOf<"files_changed"> => ({
  type: "files_changed",
  seq,
  at: AT,
  tree_hash: TREE,
  changes: paths.map((path) => ({ path, change: "modified", file_hash_before: "sha256-a", file_hash_after: "sha256-b" })),
  actor: { kind: "fs", id: "watchfiles" },
  client_op_id: null,
  ops: null,
  summary: `modified: ${String(paths.length)}`,
})

export const diagnosticsChanged = (seq: number): EventOf<"diagnostics_changed"> => ({
  type: "diagnostics_changed",
  seq,
  at: AT,
  tree_hash: TREE,
  flow_id: FLOW,
  compile_status: "invalid",
  problems: { error: 1, warning: 0, info: 0 },
})

export const resync = (seq: number): EventOf<"resync"> => ({ type: "resync", seq, at: AT, tree_hash: TREE, reason: "git_batch" })
