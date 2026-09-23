import type { ExperimentSummary, MatrixRow, MetricColumn, SeriesCaseRow, SeriesDetail, SeriesSummary } from "@/domain"
import * as ids from "@/data/ids"

const SUPPORT_CASE = ids.flowId("support_case")

export const experimentSummary = (fields: Partial<ExperimentSummary>): ExperimentSummary => ({
  id: ids.experimentId("reply_noninferior_mistral"),
  description: "mistral is not worse than gpt",
  flow: SUPPORT_CASE,
  subject: { kind: "range", flow: SUPPORT_CASE, range: { from: ids.nodeId("polish"), to: ids.nodeId("polish") } },
  failureMode: "reply_quality",
  latest: null,
  seriesCount: 0,
  spentUsd: 0,
  question: "noninferior",
  variants: [ids.variantId("gpt"), ids.variantId("mistral")],
  baseline: ids.variantId("gpt"),
  candidate: ids.variantId("mistral"),
  ...fields,
})

const CRITIQUE: MetricColumn = { id: ids.checkId("critique"), role: "primary", direction: "higher_is_better", unit: "score", margin: 0.05, relative: false }

const ROWS: readonly MatrixRow[] = [
  { variant: ids.variantId("gpt"), role: "baseline", cells: [{ metric: CRITIQUE.id, value: 0.8, ciLow: 0.7, ciHigh: 0.9, verdict: "reference" }] },
  { variant: ids.variantId("mistral"), role: "candidate", cells: [{ metric: CRITIQUE.id, value: 0.6, ciLow: 0.5, ciHigh: 0.7, verdict: "fail" }] },
]

export const seriesDetail = (fields: Partial<SeriesDetail>): SeriesDetail => ({
  id: ids.seriesId("series-1"),
  origin: { kind: "experiment", experiment: ids.experimentId("reply_noninferior_mistral") },
  flow: SUPPORT_CASE,
  dataset: ids.datasetId("support_case_cases"),
  on: "holdout",
  cases: 2,
  repeats: 3,
  variants: [ids.variantId("gpt"), ids.variantId("mistral")],
  status: "done",
  progress: { done: 12, total: 12 },
  spend: { usd: 0.4, capUsd: 1 },
  verdict: null,
  waits: 0,
  startedAt: ids.isoDateTime("2026-09-21T14:05:18Z"),
  finishedAt: ids.isoDateTime("2026-09-21T14:39:52Z"),
  question: { kind: "noninferior", baseline: ids.variantId("gpt"), candidate: ids.variantId("mistral"), primary: CRITIQUE.id, direction: "higher_is_better", margin: 0.05, relative: false, guardrails: [] },
  checks: [],
  matrix: { columns: [CRITIQUE], rows: ROWS },
  stability: [],
  ...fields,
})

export const seriesSummary = (fields: Partial<SeriesSummary>): SeriesSummary => {
  const { question, checks, matrix, stability, ...head } = seriesDetail({})
  return { ...head, question: question.kind, ...fields }
}

export const caseRow = (fields: Partial<SeriesCaseRow>): SeriesCaseRow => ({
  name: "strip_flicker_credit",
  tags: { channel: "amazon" },
  variants: [
    { variant: ids.variantId("gpt"), passed: 3, total: 3, failedChecks: [], usd: 0.03 },
    { variant: ids.variantId("mistral"), passed: 1, total: 3, failedChecks: [ids.checkId("promises")], usd: 0.02 },
  ],
  usd: 0.05,
  failing: true,
  divergent: true,
  attempts: [],
  ...fields,
})
