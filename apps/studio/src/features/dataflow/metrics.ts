import type { RunMetrics } from "@/domain"
import type { StatArrow, TagSpec } from "@/components/studio"
import { count, factor, percentChange, ratio, seconds, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type MetricId = "cost" | "time" | "tokens" | "assertions"

export type MetricBadge = TagSpec & { readonly arrow?: StatArrow }

export type MetricCard = {
  readonly id: MetricId
  readonly label: string
  readonly badge: MetricBadge
  readonly value: string
  readonly note: string
  readonly hint: string
}

type Trend = "up" | "down" | "flat"
type BadgeStyle = Pick<MetricBadge, "tone" | "fill">
type TrendStyles = Readonly<Record<Trend, BadgeStyle>>
type MetricPresenter = (metrics: RunMetrics, t: Translator<"dataflow">) => MetricCard

const METRIC_IDS: readonly MetricId[] = ["cost", "time", "tokens", "assertions"]
const TIME_DIGITS = 2
const ESTIMATE_DIGITS = 2
const NO_GROWTH = 1
const ROW_SEPARATOR = ", "

const NEUTRAL: BadgeStyle = { tone: "neutral", fill: "outline" }
const SUCCESS: BadgeStyle = { tone: "success" }
const DESTRUCTIVE: BadgeStyle = { tone: "destructive" }

const COST_STYLE: TrendStyles = { up: DESTRUCTIVE, down: SUCCESS, flat: NEUTRAL }
const TIME_STYLE: TrendStyles = { up: { tone: "warning" }, down: SUCCESS, flat: NEUTRAL }
const TOKENS_STYLE: TrendStyles = { up: NEUTRAL, down: NEUTRAL, flat: NEUTRAL }

const ARROW: Readonly<Record<Trend, { readonly arrow?: StatArrow }>> = {
  up: { arrow: "up" },
  down: { arrow: "down" },
  flat: {},
}

const trendOf = (delta: number): Trend => {
  if (delta > 0) return "up"
  if (delta < 0) return "down"
  return "flat"
}

const trendBadge = (delta: number, styles: TrendStyles, label: string): MetricBadge => {
  const trend = trendOf(delta)
  return { ...styles[trend], ...ARROW[trend], children: label }
}

const costNote = ({ cost }: RunMetrics, t: Translator<"dataflow">): string => {
  if (cost.overEstimateUsd <= 0) return t("metrics.cost.withinEstimate")
  return t("metrics.cost.overEstimate", { amount: usd(cost.overEstimateUsd, ESTIMATE_DIGITS) })
}

const timeHint = ({ time }: RunMetrics, t: Translator<"dataflow">): string => {
  if (time.traceGapS <= 0) return t("metrics.time.noTraceGap")
  return t("metrics.time.traceGap", { value: seconds(time.traceGapS) })
}

const assertionsBadge = ({ assertions }: RunMetrics, t: Translator<"dataflow">): MetricBadge => {
  const failed = assertions.total - assertions.passed
  if (failed <= 0) return { ...SUCCESS, children: t("metrics.assertions.passBadge") }
  return { ...DESTRUCTIVE, children: t("metrics.assertions.failBadge", { count: failed }) }
}

const assertionsNote = ({ assertions }: RunMetrics, t: Translator<"dataflow">): string => {
  if (assertions.failedRows.length === 0) return t("metrics.assertions.allPassed")
  return t("metrics.assertions.failedRows", { rows: assertions.failedRows.join(ROW_SEPARATOR) })
}

const METRIC_CARD: Readonly<Record<MetricId, MetricPresenter>> = {
  cost: (metrics, t) => ({
    id: "cost",
    label: t("metrics.cost.label"),
    badge: trendBadge(
      metrics.cost.valueUsd - metrics.cost.previousUsd,
      COST_STYLE,
      percentChange(metrics.cost.valueUsd, metrics.cost.previousUsd),
    ),
    value: usd(metrics.cost.valueUsd),
    note: costNote(metrics, t),
    hint: t("metrics.cost.hint"),
  }),
  time: (metrics, t) => {
    const delta = metrics.time.valueS - metrics.time.medianS
    return {
      id: "time",
      label: t("metrics.time.label"),
      badge: trendBadge(delta, TIME_STYLE, seconds(Math.abs(delta))),
      value: seconds(metrics.time.valueS, TIME_DIGITS),
      note: t("metrics.time.median", { count: metrics.time.medianRuns, value: seconds(metrics.time.medianS) }),
      hint: timeHint(metrics, t),
    }
  },
  tokens: (metrics, t) => ({
    id: "tokens",
    label: t("metrics.tokens.label"),
    badge: trendBadge(metrics.tokens.growth - NO_GROWTH, TOKENS_STYLE, factor(metrics.tokens.growth)),
    value: count(metrics.tokens.total),
    note: t("metrics.tokens.discarded", { count: count(metrics.tokens.discarded) }),
    hint: t("metrics.tokens.split", { input: count(metrics.tokens.input), output: count(metrics.tokens.output) }),
  }),
  assertions: (metrics, t) => ({
    id: "assertions",
    label: t("metrics.assertions.label"),
    badge: assertionsBadge(metrics, t),
    value: ratio(metrics.assertions),
    note: assertionsNote(metrics, t),
    hint: metrics.assertions.failureNote,
  }),
}

export const metricCards = (metrics: RunMetrics, t: Translator<"dataflow">): readonly MetricCard[] =>
  METRIC_IDS.map((id) => METRIC_CARD[id](metrics, t))
