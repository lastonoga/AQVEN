import { Link } from "@tanstack/react-router"
import { Check, Square } from "lucide-react"
import { useFormatter, useTranslations } from "use-intl"
import type { Contrast, DatasetId, FlowId, MetricColumn, NodeRange, SeriesDetail, VerdictReason } from "@/domain"
import { Actions, Heading, Stat, Surface, Tag, Text, type ActionSpec, type TagSpec } from "@/components/studio"
import { joinMeta, SEPARATOR, usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { useBuiltinNames } from "./copy"
import { Failure } from "./layout"
import { intervalText, marginText, metricName, signedValue, unitOf } from "./metrics"
import { isActive, rangeText, seriesRef, sizeText, STARTED_FORMAT } from "./presenters"
import { isLowerBound, shareOf, spendTone, verdictGap } from "./series-presenters"
import { CELL_VERDICT_TONE, SERIES_STATUS_TONE, VERDICT_TONE } from "./tones"
import { useResearchAction } from "./use-research-action"

const LIST_JOIN = ", "
const EMPTY_MARK = "—"
const METER_CLASS = "w-72 max-w-full"

const reasonTags = (reason: VerdictReason | null, label: (reason: VerdictReason) => string): readonly TagSpec[] =>
  reason === null ? [] : [{ children: label(reason), tone: "neutral", fill: "outline" }]

function SeriesTitle({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series")
  const { origin } = series
  if (origin.kind === "look") return <>{t("lookTitle", { count: origin.cases.length })}</>
  return (
    <Link to={ROUTE_PATH.experiment} params={{ experimentId: origin.experiment }} className="underline-offset-4 hover:underline">
      {origin.experiment}
    </Link>
  )
}

function LookStages({ range }: { readonly range: NodeRange | null }) {
  const t = useTranslations("research.series")
  if (range === null) return null
  return <>{`${SEPARATOR}${t("lookStages", { range: rangeText(range) })}`}</>
}

function LookSource({ flow, dataset }: { readonly flow: FlowId | null; readonly dataset: DatasetId }) {
  const t = useTranslations("research.series")
  if (flow === null) return <>{t("lookOf", { dataset })}</>
  return (
    <Link to={ROUTE_PATH.cases} params={{ flowId: flow }} search={{ dataset }} className="underline underline-offset-3">
      {t("lookOf", { dataset })}
    </Link>
  )
}

function OriginLine({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series")
  const { origin, flow } = series
  if (origin.kind === "experiment") return <>{t("experimentOf", { ref: seriesRef(series.id) })}</>
  return (
    <>
      <LookSource flow={flow} dataset={origin.dataset} />
      <LookStages range={origin.range} />
    </>
  )
}

function useSeriesActions(series: SeriesDetail): { readonly actions: readonly ActionSpec[]; readonly failure: string | null } {
  const t = useTranslations("research.series")
  const action = useResearchAction()
  const approve: readonly ActionSpec[] =
    series.status === "awaiting_approval"
      ? [{ id: "approve", label: t("approve"), variant: "default", icon: Check, pending: action.pending("approve"), onClick: () => { action.run("approve", (api) => api.approveSeries(series.id)) } }]
      : []
  const stop: readonly ActionSpec[] = isActive(series.status)
    ? [{ id: "stop", label: t("stop"), variant: "outline-destructive", icon: Square, pending: action.pending("stop"), onClick: () => { action.run("stop", (api) => api.cancelSeries(series.id)) } }]
    : []
  return { actions: [...approve, ...stop], failure: action.state.kind === "failed" ? t("actionFailed", { reason: action.state.message }) : null }
}

const liveTags = (live: boolean, label: string): readonly TagSpec[] => (live ? [{ children: label, tone: "primary", fill: "solid" }] : [])

export function SeriesHeader({ series, live }: { readonly series: SeriesDetail; readonly live: boolean }) {
  const t = useTranslations("research")
  const format = useFormatter()
  const { actions, failure } = useSeriesActions(series)
  const tags: readonly TagSpec[] = [
    { children: t(`vocabulary.status.${series.status}`), tone: SERIES_STATUS_TONE[series.status] },
    ...liveTags(live, t("series.live")),
    { children: t(`vocabulary.splitShort.${series.on}`), tone: "neutral", fill: "outline" },
  ]
  const when = (iso: string): string => format.dateTime(new Date(iso), STARTED_FORMAT)
  return (
    <div className="flex flex-col gap-3.5">
      <Heading
        size="page"
        title={<SeriesTitle series={series} />}
        tags={tags}
        wrap
        below={[
          <OriginLine key="origin" series={series} />,
          joinMeta([
            t("series.meta", { size: sizeText(series.cases, series.repeats), variants: series.variants.join(LIST_JOIN) }),
            t("series.started", { when: when(series.startedAt) }),
            series.finishedAt === null ? null : t("series.finished", { when: when(series.finishedAt) }),
          ]),
        ]}
        trailing={actions.length === 0 ? null : <Actions actions={actions} />}
      />
      {failure === null ? null : <Failure message={failure} />}
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <div className={METER_CLASS}>
          <Text as="div" role="hint" tone="neutral" className="mb-1">
            {t("series.progressLabel")}
          </Text>
          <Stat
            variant="meter"
            value={t("series.progress", { done: series.progress.done, total: series.progress.total })}
            bar={{ value: shareOf(series.progress.done, series.progress.total), tone: SERIES_STATUS_TONE[series.status] }}
          />
        </div>
        <div className={METER_CLASS}>
          <Text as="div" role="hint" tone="neutral" className="mb-1">
            {t("series.spendLabel")}
          </Text>
          <Stat
            variant="meter"
            value={t(isLowerBound(series.spend) ? "series.spendAtLeast" : "series.spend", { usd: usd(series.spend.usd), cap: usd(series.spend.capUsd) })}
            bar={{ value: shareOf(series.spend.usd, series.spend.capUsd), tone: spendTone(series) }}
            note={isLowerBound(series.spend) ? t("series.spendLowerBound", { count: series.spend.unpricedAttempts }) : null}
          />
        </div>
      </div>
    </div>
  )
}

function useContrastLine(columns: readonly MetricColumn[]): (contrast: Contrast) => string {
  const t = useTranslations("research.series.verdict")
  const builtin = useBuiltinNames()
  return (contrast) => {
    const unit = unitOf(columns, contrast.metric)
    const { value, low, high } = contrast.difference
    const values = {
      metric: metricName(contrast.metric, builtin),
      candidate: contrast.candidate,
      baseline: contrast.baseline,
      value: value === null ? EMPTY_MARK : signedValue(value, unit),
    }
    if (low === null || high === null) return t("contrast", values)
    return t("contrastInterval", { ...values, interval: intervalText(low, high, unit), margin: marginText(contrast.margin, unit, contrast.relative) })
  }
}

function Contrasts({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.verdict")
  const line = useContrastLine(series.matrix.columns)
  if (series.contrasts.length === 0) return null
  return (
    <ul aria-label={t("contrastsAria")} className="mt-2 flex flex-col gap-1">
      {series.contrasts.map((contrast) => (
        <li key={`${contrast.role}:${contrast.metric}`} className="flex min-w-0 flex-wrap items-center gap-2">
          <Tag size="micro" fill="tint" tone={CELL_VERDICT_TONE[contrast.verdict]}>
            {t(`contrastRole.${contrast.role}`)}
          </Tag>
          <Text role="data" tone="default">
            {line(contrast)}
          </Text>
        </li>
      ))}
    </ul>
  )
}

function VerdictFacts({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.verdict")
  const facts = [
    series.findingPath === null ? null : t("finding", { path: series.findingPath }),
    series.approvedBy === null ? null : t("approvedBy", { who: series.approvedBy }),
  ]
  const text = joinMeta(facts)
  if (text.length === 0) return null
  return (
    <Text as="p" role="hint" tone="neutral" className="mt-2">
      {text}
    </Text>
  )
}

function SeriesError({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research.series.verdict")
  if (series.error === null) return null
  return <Failure message={t("error", { error: series.error })} />
}

export function SeriesVerdictBlock({ series }: { readonly series: SeriesDetail }) {
  const t = useTranslations("research")
  const { verdict } = series
  if (verdict === null) {
    return (
      <Surface variant="well" padding="md" role="region" aria-label={t("series.verdict.title")}>
        <Heading size="block" title={t("series.verdict.title")} below={[t(`series.verdict.${verdictGap(series)}`)]} />
        <SeriesError series={series} />
        <VerdictFacts series={series} />
      </Surface>
    )
  }
  const tags: readonly TagSpec[] = [
    { children: t(`vocabulary.verdict.${verdict.state}`), tone: VERDICT_TONE[verdict.state], fill: "soft" },
    ...reasonTags(verdict.reason, (reason) => t(`vocabulary.reason.${reason}`)),
  ]
  return (
    <Surface variant="tinted" tone={VERDICT_TONE[verdict.state]} padding="md" role="region" aria-label={t("series.verdict.title")}>
      <Heading size="block" title={t("series.verdict.title")} tags={tags} wrap />
      <Text as="p" role="prose" tone="default" className="mt-2">
        {verdict.text}
      </Text>
      <Contrasts series={series} />
      <SeriesError series={series} />
      <VerdictFacts series={series} />
    </Surface>
  )
}
