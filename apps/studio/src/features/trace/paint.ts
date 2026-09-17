import type { CallColumn, CallStatus, ColumnFlag } from "@/domain"
import { NO_PAINT, OUTCOME_TONE, VERDICT_OUTCOME, type CellPaint, type Tone } from "@/components/studio"

type PaintRule = {
  readonly matches: (column: CallColumn, open: boolean) => boolean
  readonly paint: CellPaint
}

type AccentRule = (column: CallColumn) => Tone | undefined

const MUTED_STATUSES: ReadonlySet<CallStatus> = new Set<CallStatus>(["degraded", "cached", "idle", "waiting", "skipped", "aborted"])

const hasFlag = (column: CallColumn, flag: ColumnFlag): boolean => column.flags?.includes(flag) === true

const hasFailingCheck = (column: CallColumn): boolean => column.check?.checks?.some((check) => !check.pass) === true

const hasFailedVerdict = (column: CallColumn): boolean =>
  column.output?.kind === "verdict" && VERDICT_OUTCOME[column.output.verdict] === "failed"

const isFailed = (column: CallColumn): boolean => column.status === "failed" || hasFailingCheck(column) || hasFailedVerdict(column)

const isMuted = (column: CallColumn): boolean =>
  (column.status !== undefined && MUTED_STATUSES.has(column.status)) || hasFlag(column, "selected")

const PAINT_RULES: readonly PaintRule[] = [
  { matches: isFailed, paint: { surface: "destructive" } },
  { matches: (column) => hasFlag(column, "best"), paint: { surface: "success" } },
  { matches: (_column, open) => open, paint: { surface: "llm" } },
  { matches: isMuted, paint: { surface: "subtle" } },
]

export const columnPaint = (column: CallColumn, open: boolean): CellPaint =>
  PAINT_RULES.find((rule) => rule.matches(column, open))?.paint ?? NO_PAINT

const ACCENT_RULES: readonly AccentRule[] = [
  (column) => (column.output?.kind === "status" ? OUTCOME_TONE[column.output.status] : undefined),
  (column) => (column.status === undefined ? undefined : OUTCOME_TONE[column.status]),
  (column) => (hasFlag(column, "best") ? OUTCOME_TONE.ok : undefined),
]

export const outputAccent = (column: CallColumn, headed: boolean): Tone | undefined => {
  if (headed) return undefined
  return ACCENT_RULES.reduce<Tone | undefined>((found, rule) => found ?? rule(column), undefined) ?? OUTCOME_TONE.intermediate
}

export const outputPaint = (column: CallColumn, headed: boolean): CellPaint => {
  const accent = outputAccent(column, headed)
  return accent === undefined ? NO_PAINT : { accent }
}
