import type { ExecutionStatus } from "@/domain"
import { EXECUTION_STATUS_TONE, NO_PAINT, type CellPaint, type Tone } from "@/components/studio"
import { stageFailedBelow } from "./failures"
import type { CallColumn, StageRun } from "./model"

type PaintRule = {
  readonly matches: (column: CallColumn, open: boolean, selected: boolean) => boolean
  readonly paint: CellPaint
}

const MUTED_STATUSES: ReadonlySet<ExecutionStatus> = new Set<ExecutionStatus>(["pending", "skipped", "cancelled"])

const PAINT_RULES: readonly PaintRule[] = [
  { matches: (column) => column.status === "failed", paint: { surface: "destructive" } },
  { matches: (_column, _open, selected) => selected, paint: { surface: "neutral" } },
  { matches: (_column, open) => open, paint: { surface: "llm" } },
  { matches: (column) => MUTED_STATUSES.has(column.status), paint: { surface: "subtle" } },
]

export const columnPaint = (column: CallColumn, open: boolean, selected: boolean): CellPaint =>
  PAINT_RULES.find((rule) => rule.matches(column, open, selected))?.paint ?? NO_PAINT

export const statusTone = (status: ExecutionStatus): Tone => EXECUTION_STATUS_TONE[status]

const PARTIAL_TONE: Tone = "warning"

export const stageTone = (stage: StageRun): Tone =>
  stage.status === "ok" && stageFailedBelow(stage) > 0 ? PARTIAL_TONE : statusTone(stage.status)

export const outputPaint = (column: CallColumn): CellPaint => ({ accent: statusTone(column.status) })
