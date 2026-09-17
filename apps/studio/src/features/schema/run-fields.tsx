import type { IsoDateTime, RunId, RunStatus, RunSummary } from "@/domain"
import { Dot, NO_PAINT, OUTCOME_TONE, Text, type CellPaint, type MatrixField } from "@/components/studio"
import { ratio, runRef, seconds, usd } from "@/lib/format"

export type RunColumn = "run" | "status" | "origin" | "cost" | "time" | "assertions" | "when"

export type RunFieldContext = {
  readonly label: (column: RunColumn) => string
  readonly currentRunId: RunId | null
  readonly status: (status: RunStatus) => string
  readonly origin: (origin: RunSummary["origin"]) => string
  readonly when: (startedAt: IsoDateTime) => string
}

const CURRENT_RUN_PAINT: CellPaint = { surface: "llm" }
const DURATION_DIGITS = 2

const valueField = (id: RunColumn, label: string, track: string, value: (run: RunSummary) => string): MatrixField<RunSummary> => ({
  id,
  label,
  track,
  render: (run) => (
    <Text as="div" role="body" tone="neutral" truncate>
      {value(run)}
    </Text>
  ),
})

export const runFields = (ctx: RunFieldContext): readonly MatrixField<RunSummary>[] => [
  {
    id: "run",
    label: ctx.label("run"),
    track: "96px",
    paint: (run) => (run.id === ctx.currentRunId ? CURRENT_RUN_PAINT : NO_PAINT),
    render: (run) => (
      <Text as="div" role="body" weight="semibold" tone="default" truncate>
        {runRef(run.id)}
      </Text>
    ),
  },
  {
    id: "status",
    label: ctx.label("status"),
    track: "108px",
    render: (run) => (
      <Text as="div" role="body" className="flex min-h-lh min-w-0 items-center gap-1.5">
        <Dot tone={OUTCOME_TONE[run.status]} />
        <Text role="tiny" weight="medium" tone="neutral" truncate>
          {ctx.status(run.status)}
        </Text>
      </Text>
    ),
  },
  valueField("origin", ctx.label("origin"), "minmax(150px,1fr)", (run) => ctx.origin(run.origin)),
  valueField("cost", ctx.label("cost"), "96px", (run) => usd(run.costUsd)),
  valueField("time", ctx.label("time"), "88px", (run) => seconds(run.durationS, DURATION_DIGITS)),
  valueField("assertions", ctx.label("assertions"), "88px", (run) => ratio(run.assertions)),
  valueField("when", ctx.label("when"), "120px", (run) => ctx.when(run.startedAt)),
]
