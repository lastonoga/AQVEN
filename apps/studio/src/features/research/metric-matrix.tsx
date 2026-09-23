import { useTranslations } from "use-intl"
import type { MatrixRow, MetricCell, QuestionKind, SeriesDetail, StabilityRow } from "@/domain"
import { Empty, Matrix, Surface, Tag, Text, type CellPaint, type MatrixField } from "@/components/studio"
import { CiWhisker } from "./ci-whisker"
import { useBuiltinNames } from "./copy"
import { ResearchSection } from "./layout"
import { cellAt, matrixColumns, positionOf, STABILITY_ORDER, stabilityShares, whiskerOf, type MatrixColumnView } from "./matrix-model"
import { directionGlyph, intervalText, marginText, metricName, metricValue } from "./metrics"
import { RoleTag } from "./role-tag"
import { CELL_VERDICT_TONE, STABILITY_TONE } from "./tones"

const VARIANT_WIDTH = 132
const GATED_WIDTH = 128
const PLAIN_WIDTH = 84
const VARIANT_TRACK = `${String(VARIANT_WIDTH)}px`
const GATED_TRACK = `minmax(${String(GATED_WIDTH)}px,1.4fr)`
const PLAIN_TRACK = `minmax(${String(PLAIN_WIDTH)}px,1fr)`
const STABILITY_MIN_WIDTH = 560
const NO_PAINT: CellPaint = {}

const isGated = (view: Pick<MatrixColumnView, "column">): boolean => view.column.role === "primary" || view.column.role === "guardrail"

const matrixWidth = (series: SeriesDetail): number =>
  series.matrix.columns.reduce((width, column) => width + (isGated({ column }) ? GATED_WIDTH : PLAIN_WIDTH), VARIANT_WIDTH)

const cellPaint = (cell: MetricCell | undefined): CellPaint => {
  if (cell === undefined || cell.verdict === "none" || cell.verdict === "reference") return NO_PAINT
  return { accent: CELL_VERDICT_TONE[cell.verdict] }
}

type VariantCellProps = { readonly row: Pick<MatrixRow, "variant" | "role">; readonly question: QuestionKind; readonly inline?: boolean }

function VariantCell({ row, question, inline = false }: VariantCellProps) {
  return (
    <div className={inline ? "flex min-w-0 items-center gap-2" : "flex min-w-0 flex-col items-start gap-1"}>
      <Text as="div" role="cell" tone="default" weight="semibold" truncate title={row.variant} className="max-w-full">
        {row.variant}
      </Text>
      <RoleTag role={row.role} question={question} />
    </div>
  )
}

function MetricValue({ row, view }: { readonly row: MatrixRow; readonly view: MatrixColumnView }) {
  const t = useTranslations("research")
  const builtin = useBuiltinNames()
  const cell = cellAt(row, view.column.id)
  const { unit } = view.column
  if (cell === undefined || cell.value === null) {
    return (
      <Text as="div" role="cell" tone="neutral">
        {t("series.matrix.noValue")}
      </Text>
    )
  }
  const value = metricValue(cell.value, unit)
  const interval = cell.ciLow === null || cell.ciHigh === null ? null : intervalText(cell.ciLow, cell.ciHigh, unit)
  const metric = metricName(view.column.id, builtin)
  const verdict = t(`vocabulary.cellVerdict.${cell.verdict}`)
  const label =
    interval === null
      ? t("series.matrix.cell", { metric, variant: row.variant, value })
      : t("series.matrix.cellInterval", { metric, variant: row.variant, value, interval, verdict })
  const scale = view.scale
  const gated = isGated(view)
  return (
    <div className="min-w-0" title={interval ?? undefined}>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <Text role="cell" tone="default" weight="semibold">
          {value}
        </Text>
        {cell.verdict === "none" || cell.verdict === "reference" ? null : (
          <Tag size="micro" fill="tint" tone={CELL_VERDICT_TONE[cell.verdict]}>
            {verdict}
          </Tag>
        )}
      </div>
      {interval === null || !gated ? null : (
        <Text as="div" role="small" tone="neutral">
          {interval}
        </Text>
      )}
      <CiWhisker
        whisker={whiskerOf(cell, scale)}
        marks={scale === null ? [] : view.marks.map((mark) => positionOf(mark, scale))}
        tone={CELL_VERDICT_TONE[cell.verdict]}
        label={label}
      />
    </div>
  )
}

function useColumnSub(): (view: MatrixColumnView) => string {
  const t = useTranslations("research")
  return ({ column }) => {
    const role = t(`vocabulary.metricRole.${column.role}`)
    const direction = directionGlyph(column.direction)
    if (column.margin === null) return t("series.matrix.plainSub", { role, direction })
    return t("series.matrix.marginSub", { role, margin: marginText(column.margin, column.unit, column.relative), direction })
  }
}

function useMatrixFields(series: SeriesDetail): readonly MatrixField<MatrixRow>[] {
  const t = useTranslations("research.series.matrix")
  const builtin = useBuiltinNames()
  const sub = useColumnSub()
  const views = matrixColumns(series.matrix, series.question)
  return [
    { id: "variant", label: t("variant"), track: VARIANT_TRACK, render: (row) => <VariantCell row={row} question={series.question.kind} /> },
    ...views.map(
      (view): MatrixField<MatrixRow> => ({
        id: view.column.id,
        label: metricName(view.column.id, builtin),
        sub: sub(view),
        verbatim: true,
        track: isGated(view) ? GATED_TRACK : PLAIN_TRACK,
        paint: (row) => cellPaint(cellAt(row, view.column.id)),
        render: (row) => <MetricValue row={row} view={view} />,
      }),
    ),
  ]
}

function StabilityBar({ row }: { readonly row: StabilityRow }) {
  const t = useTranslations("research.series.stability")
  return (
    <div role="img" aria-label={t("shareAria", { always: row.always, flaky: row.flaky, never: row.never })} className="flex h-2 w-full overflow-hidden rounded-xs bg-border">
      {stabilityShares(row).map((share) => (
        <span key={share.kind} data-tone={STABILITY_TONE[share.kind]} className="h-full bg-tone" style={{ width: `${String(share.share)}%` }} />
      ))}
    </div>
  )
}

function useStabilityFields(series: SeriesDetail): readonly MatrixField<StabilityRow>[] {
  const t = useTranslations("research")
  const roles = new Map(series.matrix.rows.map((row) => [row.variant, row.role]))
  return [
    { id: "variant", label: t("series.stability.variant"), track: "minmax(200px,0.6fr)", render: (row) => <VariantCell inline row={{ variant: row.variant, role: roles.get(row.variant) ?? "other" }} question={series.question.kind} /> },
    ...STABILITY_ORDER.map(
      (kind): MatrixField<StabilityRow> => ({
        id: kind,
        label: t(`vocabulary.stability.${kind}`),
        track: "88px",
        align: "end",
        render: (row) => (
          <Text role="cell" tone={row[kind] === 0 ? "neutral" : STABILITY_TONE[kind]} weight="semibold">
            {String(row[kind])}
          </Text>
        ),
      }),
    ),
    { id: "spread", label: t("series.stability.spread"), track: "minmax(160px,1fr)", render: (row) => <StabilityBar row={row} /> },
  ]
}

function StabilityTable({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.stability")
  const fields = useStabilityFields(series)
  if (series.stability.length === 0) return null
  return (
    <section aria-label={t("title")} className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <Text role="block" tone="default" weight="semibold">
          {t("title")}
        </Text>
        <Text role="caption" tone="neutral">
          {t("hint")}
        </Text>
      </div>
      <Surface variant="panel" className="mt-1.75 overflow-x-auto">
        <Matrix orientation="rows" rules="rows" label={t("aria")} minWidth={STABILITY_MIN_WIDTH} items={series.stability} itemKey={(row) => row.variant} fields={fields} />
      </Surface>
    </section>
  )
}

function MatrixTable({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.matrix")
  const fields = useMatrixFields(series)
  if (series.progress.done === 0) return <Empty title={t("empty")} />
  return (
    <Surface variant="panel" className="overflow-x-auto">
      <Matrix
        orientation="rows"
        label={t("aria")}
        minWidth={matrixWidth(series)}
        items={series.matrix.rows}
        itemKey={(row) => row.variant}
        fields={fields}
      />
    </Surface>
  )
}

export function MetricMatrix({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.matrix")
  return (
    <ResearchSection title={t("title")} description={t("hint")}>
      <MatrixTable series={series} />
      <StabilityTable series={series} />
    </ResearchSection>
  )
}
