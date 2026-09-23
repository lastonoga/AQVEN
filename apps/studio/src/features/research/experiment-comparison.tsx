import { useTranslations } from "use-intl"
import type { CompareQuestion, Contrast, MatrixRow, MetricUnit, NoninferiorQuestion, SeriesDetail, StabilityRow, ThresholdQuestion } from "@/domain"
import { Surface, Tag, Text } from "@/components/studio"
import { CiWhisker } from "./ci-whisker"
import { useBuiltinNames } from "./copy"
import { ResearchSection } from "./layout"
import { cellAt, matrixColumns, positionOf, stabilityShares, whiskerOf, type MatrixColumnView } from "./matrix-model"
import { intervalText, marginText, metricName, metricValue, signedValue } from "./metrics"
import { RoleTag } from "./role-tag"
import { CELL_VERDICT_TONE, STABILITY_TONE } from "./tones"

type SideProps = { readonly series: SeriesDetail; readonly row: MatrixRow; readonly view: MatrixColumnView }

const COST_OF_PASS = "cost_of_pass"
const EMPTY_MARK = "—"

const stabilityOf = (series: SeriesDetail, row: MatrixRow): StabilityRow | null => series.stability.find((item) => item.variant === row.variant) ?? null

const valueText = (value: number | null | undefined, unit: MetricUnit): string => (value === null || value === undefined ? EMPTY_MARK : metricValue(value, unit))

const intervalOf = (low: number | null, high: number | null, unit: MetricUnit): string | null => (low === null || high === null ? null : intervalText(low, high, unit))

function StabilityBar({ row }: { readonly row: StabilityRow }) {
  const t = useTranslations("research.experiment.comparison")
  return (
    <div role="img" aria-label={t("stability", { always: row.always, flaky: row.flaky, never: row.never })} className="flex h-2 w-full overflow-hidden rounded-xs bg-border">
      {stabilityShares(row).map((share) => (
        <span key={share.kind} data-tone={STABILITY_TONE[share.kind]} className="h-full bg-tone" style={{ width: `${String(share.share)}%` }} />
      ))}
    </div>
  )
}

function VariantSide({ series, row, view }: SideProps) {
  const t = useTranslations("research.experiment.comparison")
  const builtin = useBuiltinNames()
  const cell = cellAt(row, view.column.id)
  const { unit } = view.column
  const value = valueText(cell?.value, unit)
  const interval = cell === undefined ? null : intervalOf(cell.ciLow, cell.ciHigh, unit)
  const cost = cellAt(row, COST_OF_PASS)
  const stability = stabilityOf(series, row)
  const { scale } = view
  return (
    <div className="flex min-w-0 flex-col gap-2" aria-label={row.variant} role="group">
      <div className="flex min-w-0 items-center gap-2">
        <Text role="block" tone="default" weight="semibold" truncate>
          {row.variant}
        </Text>
        <RoleTag role={row.role} question={series.question.kind} />
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <Text role="section" tone="default" weight="semibold">
          {value}
        </Text>
        <Text role="small" tone="neutral">
          {interval === null ? metricName(view.column.id, builtin) : t("valueOf", { metric: metricName(view.column.id, builtin), interval })}
        </Text>
      </div>
      <CiWhisker
        whisker={whiskerOf(cell, scale)}
        marks={scale === null ? [] : view.marks.map((mark) => positionOf(mark, scale))}
        tone={cell === undefined ? "neutral" : CELL_VERDICT_TONE[cell.verdict]}
        label={t("whisker", { variant: row.variant, value })}
      />
      <Text role="hint" tone="neutral">
        {t("costOfPass", { value: valueText(cost?.value, "usd") })}
      </Text>
      {stability === null ? null : <StabilityBar row={stability} />}
    </div>
  )
}

function Difference({ contrast, unit }: { readonly contrast: Contrast | null; readonly unit: MetricUnit }) {
  const t = useTranslations("research")
  if (contrast === null) {
    return (
      <Text role="section" tone="neutral">
        {EMPTY_MARK}
      </Text>
    )
  }
  const { value, low, high } = contrast.difference
  const interval = intervalOf(low, high, unit)
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center" role="group" aria-label={t("experiment.comparison.difference")}>
      <Text role="hint" tone="neutral">
        {t("experiment.comparison.difference")}
      </Text>
      <Text role="section" tone="default" weight="semibold">
        {value === null ? EMPTY_MARK : signedValue(value, unit)}
      </Text>
      {interval === null ? null : (
        <Text role="small" tone="neutral">
          {t("experiment.comparison.interval", { interval })}
        </Text>
      )}
      <Tag size="micro" fill="tint" tone={CELL_VERDICT_TONE[contrast.verdict]}>
        {t(`vocabulary.cellVerdict.${contrast.verdict}`)}
      </Tag>
      <Text role="caption" tone="neutral">
        {t("experiment.comparison.margin", { margin: marginText(contrast.margin, unit, contrast.relative) })}
      </Text>
    </div>
  )
}

function PairCard({ series, question, view }: { readonly series: SeriesDetail; readonly question: CompareQuestion | NoninferiorQuestion; readonly view: MatrixColumnView }) {
  const baseline = series.matrix.rows.find((row) => row.variant === question.baseline)
  const candidate = series.matrix.rows.find((row) => row.variant === question.candidate)
  if (baseline === undefined || candidate === undefined) return null
  const contrast = series.contrasts.find((item) => item.role === "primary") ?? null
  return (
    <Surface variant="panel" padding="md" className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
      <VariantSide series={series} row={baseline} view={view} />
      <Difference contrast={contrast} unit={view.column.unit} />
      <VariantSide series={series} row={candidate} view={view} />
    </Surface>
  )
}

function ThresholdCard({ series, question, view }: { readonly series: SeriesDetail; readonly question: ThresholdQuestion; readonly view: MatrixColumnView }) {
  const t = useTranslations("research.experiment.comparison")
  const builtin = useBuiltinNames()
  const { unit } = view.column
  const rows = question.variant === null ? series.matrix.rows : series.matrix.rows.filter((row) => row.variant === question.variant)
  return (
    <Surface variant="panel" padding="md" className="flex flex-col gap-4">
      <Text role="hint" tone="neutral">
        {t("threshold", { metric: metricName(question.metric, builtin), bound: question.bound, value: metricValue(question.value, unit), margin: marginText(question.margin, unit, false) })}
      </Text>
      {rows.map((row) => (
        <VariantSide key={row.variant} series={series} row={row} view={view} />
      ))}
    </Surface>
  )
}

function ComparisonCard({ series, view }: { readonly series: SeriesDetail; readonly view: MatrixColumnView }) {
  const { question } = series
  if (question.kind === "threshold") return <ThresholdCard series={series} question={question} view={view} />
  if (question.kind === "look") return null
  return <PairCard series={series} question={question} view={view} />
}

export function ExperimentComparison({ latest }: { readonly latest: SeriesDetail | null }) {
  const t = useTranslations("research.experiment.comparison")
  if (latest === null || latest.question.kind === "look" || latest.progress.done === 0) return null
  const primary = matrixColumns(latest.matrix, latest.question).find((view) => view.column.role === "primary")
  if (primary === undefined) return null
  return (
    <ResearchSection title={t("title")} description={t("hint")}>
      <ComparisonCard series={latest} view={primary} />
    </ResearchSection>
  )
}
