import type { DatasetRunRef, RunHistory, TestDetail, TestRunSummary } from "@/domain"
import { NODE_KIND, type TagFill, type TagSpec, type Tone } from "@/components/studio"
import { count, joinMeta, ratio, seconds, signedCount, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type SummaryMetric = { readonly id: string; readonly label: string; readonly value: string }
export type RunChip = { readonly label: string; readonly tone: Tone; readonly fill: TagFill }
export type RunChips = { readonly previous: RunChip; readonly current: RunChip }

const WHOLE_SECONDS_FROM = 10
const CHIP_USD_DIGITS = 2

export const totalDuration = (value: number): string => seconds(value, value >= WHOLE_SECONDS_FROM ? 0 : 1)

export const summaryMetrics = (summary: TestRunSummary, t: Translator<"testDetail">): readonly SummaryMetric[] => [
  { id: "rows", label: t("metrics.rows"), value: count(summary.rows) },
  { id: "pass", label: t("metrics.pass"), value: ratio({ passed: summary.passed, total: summary.rows }) },
  { id: "cost", label: t("metrics.cost"), value: usd(summary.costUsd) },
  { id: "time", label: t("metrics.time"), value: totalDuration(summary.durationS) },
  { id: "delta", label: t("metrics.deltaVsPrevious"), value: t("metrics.passDelta", { delta: signedCount(summary.passDelta) }) },
]

export const scopeLine = (detail: TestDetail, t: Translator<"testDetail">): string =>
  t("summary.scope", { stage: detail.stage.index, stageName: detail.stage.name, count: detail.frozenAncestorCount })

export const promptSourceNote = (source: TestDetail["promptSource"], t: Translator<"testDetail">): string =>
  joinMeta([t("summary.promptFromDraft", { revision: source.draftRevision }), source.cassette ? t("summary.cassette") : t("summary.noCassette")])

export const targetTag = (target: TestDetail["target"]): TagSpec => ({
  tone: NODE_KIND[target.kind].tone,
  size: "sm",
  fill: "soft",
  children: `${NODE_KIND[target.kind].code} ${target.nodeId}`,
})

const passShare = (run: DatasetRunRef): number => (run.pass.total === 0 ? 0 : run.pass.passed / run.pass.total)

const trendTone = (history: RunHistory): Tone => {
  const change = passShare(history.current) - passShare(history.previous)
  if (change > 0) return "success"
  if (change < 0) return "destructive"
  return "neutral"
}

const chipLabel = (run: DatasetRunRef, t: Translator<"testDetail">): string => {
  const values = { run: run.revision, ratio: ratio(run.pass, false), cost: usd(run.costUsd, CHIP_USD_DIGITS) }
  return run.draft ? t("runs.draftChip", values) : t("runs.chip", values)
}

export const runChips = (history: RunHistory, t: Translator<"testDetail">): RunChips => ({
  previous: { label: chipLabel(history.previous, t), tone: "neutral", fill: "outline" },
  current: { label: chipLabel(history.current, t), tone: trendTone(history), fill: "soft" },
})
