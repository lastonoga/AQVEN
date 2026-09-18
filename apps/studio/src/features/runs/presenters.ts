import type { ApiNodeCounts, ApiRun, ApiValueRef, IsoDateTime, RunId } from "@/domain"
import { RUN_STATUS_TONE, type Tone } from "@/components/studio"
import * as ids from "@/data/ids"
import { count, runRef, seconds, usd } from "@/lib/format"

export type RunRow = {
  readonly id: RunId
  readonly ref: string
  readonly tone: Tone
  readonly run: ApiRun
  readonly selected: boolean
  readonly startedAt: IsoDateTime
  readonly duration: string | null
  readonly cost: string
  readonly done: number
  readonly total: number
  readonly failed: number
  readonly progress: number
  readonly waitingOn: string | null
  readonly forkedFrom: string | null
}

const MS_PER_SECOND = 1000
const SUB_SECOND_MS = 1000
const HASH_PREFIX = /^sha256-/
const HASH_LENGTH = 12
export const decimalNumber = (raw: string): number => {
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

export const costText = (raw: string): string => usd(decimalNumber(raw))

export const shortHash = (hash: string): string => hash.replace(HASH_PREFIX, "").slice(0, HASH_LENGTH)

export const latencyText = (latencyMs: number | null): string | null => {
  if (latencyMs === null) return null
  if (latencyMs < SUB_SECOND_MS) return `${count(latencyMs)} ms`
  return seconds(latencyMs / MS_PER_SECOND)
}

export const elapsedMs = (startedAt: string, finishedAt: string | null, now: Date): number | null => {
  const start = Date.parse(startedAt)
  const end = finishedAt === null ? now.getTime() : Date.parse(finishedAt)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.max(0, end - start)
}

export const tokensText = (tokensIn: number, tokensOut: number): string => `${count(tokensIn)} / ${count(tokensOut)}`

export const doneCount = (counts: ApiNodeCounts): number => counts.ok + counts.failed + counts.skipped + counts.cancelled

export const totalCount = (counts: ApiNodeCounts): number =>
  doneCount(counts) + counts.pending + counts.running + counts.suspended

const progressOf = (counts: ApiNodeCounts): number => {
  const total = totalCount(counts)
  return total === 0 ? 0 : doneCount(counts) / total
}

const forkedFrom = (run: ApiRun): string | null => {
  if (run.lineage === null || run.lineage.relation !== "fork") return null
  return runRef(run.lineage.parent_run_id)
}

const waitingOn = (run: ApiRun): string | null => run.waits.at(0)?.assignee ?? null

export const runRows = (runs: readonly ApiRun[], selected: RunId | null, now: Date): readonly RunRow[] =>
  runs.map((run) => ({
    id: ids.runId(run.run_id),
    ref: runRef(run.run_id),
    tone: RUN_STATUS_TONE[run.status],
    run,
    selected: run.run_id === selected,
    startedAt: ids.isoDateTime(run.started_at),
    duration: latencyText(elapsedMs(run.started_at, run.finished_at, now)),
    cost: costText(run.cost_usd),
    done: doneCount(run.node_counts),
    total: totalCount(run.node_counts),
    failed: run.node_counts.failed,
    progress: progressOf(run.node_counts),
    waitingOn: waitingOn(run),
    forkedFrom: forkedFrom(run),
  }))

export const inlineJson = (ref: ApiValueRef | null): string | null => {
  if (ref === null) return null
  if (ref.kind === "blob") return `${ref.media_type} · ${count(ref.size_bytes)} bytes`
  return JSON.stringify(ref.value, null, 2)
}

export const jsonLines = (text: string): readonly (readonly string[])[] => text.split("\n").map((line) => [line])
