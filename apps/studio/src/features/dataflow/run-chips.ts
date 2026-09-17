import type { IsoDateTime, RunId, RunStatus, RunSummary } from "@/domain"
import { OUTCOME_TONE, type Tone } from "@/components/studio"
import { ratio, runRef, usd } from "@/lib/format"

export type RunChip = {
  readonly id: RunId
  readonly ref: string
  readonly status: RunStatus
  readonly tone: Tone
  readonly ratio: string
  readonly cost: string
  readonly selected: boolean
  readonly latest: boolean
  readonly startedAt: IsoDateTime
}

const LATEST_INDEX = 0

export const runChips = (runs: readonly RunSummary[], selectedId: RunId | null): readonly RunChip[] =>
  runs.map((run, index) => ({
    id: run.id,
    ref: runRef(run.id),
    status: run.status,
    tone: OUTCOME_TONE[run.status],
    ratio: ratio(run.assertions, false),
    cost: usd(run.costUsd),
    selected: run.id === selectedId,
    latest: index === LATEST_INDEX,
    startedAt: run.startedAt,
  }))
