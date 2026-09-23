import type {
  DatasetId,
  ExperimentDetail,
  ExperimentFilter,
  ExperimentId,
  ExperimentQuestion,
  ExperimentSummary,
  FlowId,
  LatestSeries,
  LaunchEstimate,
  LaunchRecommendation,
  LaunchRequest,
  RunId,
  SeriesCaseFilter,
  SeriesCaseRow,
  SeriesDetail,
  SeriesId,
  SeriesSplit,
  SeriesStatus,
  SeriesSummary,
  VariantId,
} from "@/domain"
import { ACTIVE_SERIES_STATUSES } from "@/domain"
import * as ids from "@/data/ids"
import {
  DATASETS,
  EXPERIMENTS,
  LOOK_CHECKS,
  LOOK_MODEL,
  LOOK_VARIANT,
  notesOf,
  type DatasetCaseFixture,
  type DatasetFixture,
  type ExperimentFixture,
} from "./research-catalog"
import { casesFor, effectiveSize, halfWidthOf, mean, roundTo, sum } from "./research-math"
import { metricColumns, seriesCases, seriesDetail, seriesIdOf, seriesSummary, type SeriesContext, type SeriesFixture } from "./research-series"

export type ResearchStore = {
  readonly experiments: (filter: ExperimentFilter) => readonly ExperimentSummary[]
  readonly experiment: (id: ExperimentId) => ExperimentDetail | null
  readonly estimate: (id: ExperimentId, request: LaunchRequest) => LaunchEstimate | null
  readonly startSeries: (id: ExperimentId, request: LaunchRequest) => SeriesId | null
  readonly approveSeries: (id: SeriesId) => SeriesSummary | null
  readonly cancelSeries: (id: SeriesId) => SeriesSummary | null
  readonly series: (id: SeriesId) => SeriesDetail | null
  readonly seriesCases: (id: SeriesId, filter: SeriesCaseFilter) => readonly SeriesCaseRow[] | null
  readonly seriesOfExperiment: (id: ExperimentId) => readonly SeriesSummary[] | null
  readonly startLook: (flow: FlowId, dataset: DatasetId, caseNames: readonly string[]) => SeriesId | null
  readonly reset: () => void
}

type SeriesSeed = {
  readonly key: string
  readonly experiment: string
  readonly on: SeriesSplit
  readonly status: SeriesStatus
  readonly done: number | null
  readonly startedAt: string
  readonly finishedAt: string | null
}

const ICC = 0.3
const PARALLEL_ATTEMPTS = 4
const MS_PER_MINUTE = 60_000
const APPROVAL_USD = 1
const LOOK_FLOW = ids.flowId("support_case")
const LOOK_DATASET = ids.datasetId("support_case_cases")

export const FORM_WAIT_RUN: RunId = ids.runId("01a0b148-4489-7696-91c6-841c80234778")
export const APPROVAL_WAIT_RUN: RunId = ids.runId("01a0b104-4658-70aa-b49b-7c2586b56d92")

const SEEDS: readonly SeriesSeed[] = [
  { key: "reply_noninferior_mistral/dev/1", experiment: "reply_noninferior_mistral", on: "dev", status: "done", done: null, startedAt: "2026-09-20T09:12:04Z", finishedAt: "2026-09-20T09:31:40Z" },
  { key: "reply_noninferior_mistral/holdout/1", experiment: "reply_noninferior_mistral", on: "holdout", status: "done", done: null, startedAt: "2026-09-21T14:05:18Z", finishedAt: "2026-09-21T14:39:52Z" },
  { key: "intent_split_long_messages/holdout/1", experiment: "intent_split_long_messages", on: "holdout", status: "done", done: null, startedAt: "2026-09-19T11:02:31Z", finishedAt: "2026-09-19T11:14:07Z" },
  { key: "critique_planted_defects/dev/1", experiment: "critique_planted_defects", on: "dev", status: "done", done: null, startedAt: "2026-09-22T08:30:12Z", finishedAt: "2026-09-22T08:41:55Z" },
  { key: "reply_overpromise_risk/holdout/1", experiment: "reply_overpromise_risk", on: "holdout", status: "awaiting_approval", done: 0, startedAt: "2026-09-23T07:55:40Z", finishedAt: null },
  { key: "intent_escalation_agents/dev/1", experiment: "intent_escalation_agents", on: "dev", status: "running", done: 58, startedAt: "2026-09-23T08:40:09Z", finishedAt: null },
  { key: "judge_panel_agents/holdout/1", experiment: "judge_panel_agents", on: "holdout", status: "done", done: null, startedAt: "2026-09-18T16:20:44Z", finishedAt: "2026-09-18T16:52:13Z" },
  { key: "panel_single_judge/dev/1", experiment: "panel_single_judge", on: "dev", status: "cancelled", done: 20, startedAt: "2026-09-21T10:00:27Z", finishedAt: "2026-09-21T10:06:02Z" },
  { key: "panel_single_judge/holdout/1", experiment: "panel_single_judge", on: "holdout", status: "failed", done: 41, startedAt: "2026-09-22T17:10:33Z", finishedAt: "2026-09-22T17:24:51Z" },
]

const LOOK_SERIES: SeriesFixture = {
  key: "look/support_case/1",
  origin: { kind: "look", dataset: LOOK_DATASET, cases: ["strip_flicker_credit", "bulb_app_offline_advice", "lamp_crushed_box_reship"] },
  flow: LOOK_FLOW,
  on: "dev",
  caseNames: ["strip_flicker_credit", "bulb_app_offline_advice", "lamp_crushed_box_reship"],
  repeats: 1,
  status: "waiting_human",
  done: 1,
  startedAt: ids.isoDateTime("2026-09-23T06:10:15Z"),
  finishedAt: null,
  models: { [LOOK_VARIANT]: LOOK_MODEL },
  waiting: { bulb_app_offline_advice: FORM_WAIT_RUN, lamp_crushed_box_reship: APPROVAL_WAIT_RUN },
}

const datasetOf = (id: DatasetId): DatasetFixture | null => DATASETS.find((dataset) => dataset.id === id) ?? null

const matchesTags = (tags: Readonly<Record<string, string>>) => (item: DatasetCaseFixture): boolean =>
  Object.entries(tags).every(([key, value]) => item.tags[key] === value)

const selectionOf = (experiment: ExperimentFixture): readonly DatasetCaseFixture[] =>
  (datasetOf(experiment.dataset)?.cases ?? []).filter(matchesTags(experiment.tags))

const experimentOf = (id: string): ExperimentFixture | null => EXPERIMENTS.find((experiment) => experiment.id === id) ?? null

const requireDataset = (id: DatasetId): DatasetFixture => {
  const dataset = datasetOf(id)
  if (dataset === null) throw new Error(`No fixture dataset ${id}`)
  return dataset
}

const judgeValidated = (experiment: ExperimentFixture): boolean =>
  experiment.checks.every((check) => check.source.kind !== "judge" || check.source.validatedBy !== null)

const seedFixture = (seed: SeriesSeed): SeriesFixture => {
  const experiment = experimentOf(seed.experiment)
  if (experiment === null) throw new Error(`No fixture experiment ${seed.experiment}`)
  const selection = selectionOf(experiment)
  return {
    key: seed.key,
    origin: { kind: "experiment", experiment: experiment.id },
    flow: experiment.subject.kind === "arm" ? null : experiment.subject.flow,
    on: seed.on,
    caseNames: selection.slice(0, experiment.plan.cases ?? selection.length).map((item) => item.name),
    repeats: experiment.plan.repeats,
    status: seed.status,
    done: seed.done,
    startedAt: ids.isoDateTime(seed.startedAt),
    finishedAt: seed.finishedAt === null ? null : ids.isoDateTime(seed.finishedAt),
    models: experiment.models,
    waiting: {},
  }
}

const contextOf = (fixture: SeriesFixture): SeriesContext => {
  if (fixture.origin.kind === "look") {
    return {
      question: { kind: "look" },
      checks: LOOK_CHECKS,
      variants: [{ id: LOOK_VARIANT, role: "other" }],
      dataset: requireDataset(fixture.origin.dataset),
      judgeValidated: true,
    }
  }
  const experiment = experimentOf(fixture.origin.experiment)
  if (experiment === null) throw new Error(`No fixture experiment ${fixture.origin.experiment}`)
  return {
    question: experiment.question,
    checks: experiment.checks,
    variants: experiment.variants.map((item) => ({ id: item.id, role: item.role })),
    dataset: requireDataset(experiment.dataset),
    judgeValidated: judgeValidated(experiment),
  }
}

const marginOf = (question: ExperimentQuestion): number | null => (question.kind === "look" ? null : question.margin)

const recommendationOf = (experiment: ExperimentFixture, request: LaunchRequest, available: number): LaunchRecommendation => {
  const margin = marginOf(experiment.question)
  if (margin === null) return { cases: request.cases, reason: "look" }
  if (margin === 0) return { cases: experiment.plan.cases ?? available, reason: "no_margin" }
  const needed = casesFor(experiment.spread, margin, request.repeats, ICC)
  return { cases: needed, reason: needed > request.cases ? "wide" : "enough" }
}

const estimateOf = (experiment: ExperimentFixture, request: LaunchRequest): LaunchEstimate => {
  const models = Object.values(experiment.models)
  const variants = experiment.variants.length
  const attempts = request.cases * request.repeats * variants
  const usd = roundTo(attempts * mean(models.map((model) => model.usd)), 4)
  const minutes = Math.max(1, Math.ceil((attempts * mean(models.map((model) => model.latencyMs))) / PARALLEL_ATTEMPTS / MS_PER_MINUTE))
  const available = selectionOf(experiment).length
  const margin = marginOf(experiment.question)
  const recommended = recommendationOf(experiment, request, available)
  return {
    request,
    variants,
    attempts,
    usd,
    minutes,
    available,
    halfWidth: margin === null ? null : roundTo(halfWidthOf(experiment.spread, effectiveSize(request.cases, request.repeats, ICC)), 4),
    margin,
    recommended,
    belowRecommended: request.cases < recommended.cases,
    needsApproval: usd > APPROVAL_USD,
  }
}

const latestOf = (series: readonly SeriesSummary[]): LatestSeries | null => {
  const latest = [...series].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0]
  if (latest === undefined) return null
  return { id: latest.id, on: latest.on, status: latest.status, verdict: latest.verdict?.state ?? null }
}

const isActive = (status: SeriesStatus): boolean => ACTIVE_SERIES_STATUSES.some((item) => item === status)

const baselineOf = (question: ExperimentQuestion): VariantId | null => {
  if (question.kind === "compare" || question.kind === "noninferior") return question.baseline
  return null
}

const candidateOf = (question: ExperimentQuestion): VariantId | null => {
  if (question.kind === "compare" || question.kind === "noninferior") return question.candidate
  if (question.kind === "threshold") return question.variant
  return null
}

const newestFirst = (left: SeriesSummary, right: SeriesSummary): number => Date.parse(right.startedAt) - Date.parse(left.startedAt)

export const createResearchStore = (clock: () => Date = () => new Date()): ResearchStore => {
  let fixtures: readonly SeriesFixture[] = [...SEEDS.map(seedFixture), LOOK_SERIES]
  let counter = 0

  const nextKey = (prefix: string): string => {
    counter += 1
    return `started/${prefix}/${String(counter)}`
  }

  const fixtureOf = (id: SeriesId): SeriesFixture | null => fixtures.find((fixture) => seriesIdOf(fixture.key) === id) ?? null

  const detailOf = (fixture: SeriesFixture): SeriesDetail => seriesDetail(fixture, contextOf(fixture))

  const summariesOf = (experiment: ExperimentId): readonly SeriesSummary[] =>
    fixtures
      .filter((fixture) => fixture.origin.kind === "experiment" && fixture.origin.experiment === experiment)
      .map((fixture) => seriesSummary(detailOf(fixture)))
      .sort(newestFirst)

  const aggregates = (experiment: ExperimentFixture) => {
    const series = summariesOf(experiment.id)
    return { latest: latestOf(series), seriesCount: series.length, spentUsd: roundTo(sum(series.map((item) => item.spend.usd)), 4) }
  }

  const summaryOf = (experiment: ExperimentFixture): ExperimentSummary => ({
    id: experiment.id,
    description: experiment.description,
    flow: experiment.flow,
    subject: experiment.subject,
    failureMode: experiment.failureMode,
    question: experiment.question.kind,
    variants: experiment.variants.map((item) => item.id),
    baseline: baselineOf(experiment.question),
    candidate: candidateOf(experiment.question),
    ...aggregates(experiment),
  })

  const detailOfExperiment = (experiment: ExperimentFixture): ExperimentDetail => {
    const dataset = requireDataset(experiment.dataset)
    const notes = notesOf(experiment)
    const folder = `experiments/${experiment.id}`
    return {
      id: experiment.id,
      description: experiment.description,
      flow: experiment.flow,
      subject: experiment.subject,
      failureMode: experiment.failureMode,
      question: experiment.question,
      arms: experiment.arms,
      cases: { dataset: dataset.id, flow: dataset.flow, tags: experiment.tags, selected: selectionOf(experiment).length, total: dataset.cases.length },
      variants: experiment.variants,
      checks: experiment.checks,
      metrics: metricColumns(experiment.question, experiment.checks),
      plan: experiment.plan,
      notes,
      files: { spec: ids.filePath(`${folder}/experiment.yaml`), notes: notes === null ? null : ids.filePath(`${folder}/experiment.md`) },
      ...aggregates(experiment),
    }
  }

  const FILTERS: readonly ((summary: ExperimentSummary, filter: ExperimentFilter) => boolean)[] = [
    (summary, filter) => filter.flow === undefined || summary.flow === filter.flow,
    (summary, filter) => filter.question === undefined || summary.question === filter.question,
    (summary, filter) => filter.failureMode === undefined || summary.failureMode === filter.failureMode,
  ]

  const replace = (next: SeriesFixture): SeriesSummary => {
    fixtures = fixtures.map((fixture) => (fixture.key === next.key ? next : fixture))
    return seriesSummary(detailOf(next))
  }

  const moveTo = (id: SeriesId, allowed: (status: SeriesStatus) => boolean, status: SeriesStatus, finished: boolean): SeriesSummary | null => {
    const fixture = fixtureOf(id)
    if (fixture === null) return null
    if (!allowed(fixture.status)) return seriesSummary(detailOf(fixture))
    return replace({ ...fixture, status, finishedAt: finished ? ids.isoDateTime(clock().toISOString()) : fixture.finishedAt })
  }

  return {
    experiments: (filter) => EXPERIMENTS.map(summaryOf).filter((summary) => FILTERS.every((keep) => keep(summary, filter))),
    experiment: (id) => {
      const experiment = experimentOf(id)
      return experiment === null ? null : detailOfExperiment(experiment)
    },
    estimate: (id, request) => {
      const experiment = experimentOf(id)
      return experiment === null ? null : estimateOf(experiment, request)
    },
    startSeries: (id, request) => {
      const experiment = experimentOf(id)
      if (experiment === null) return null
      const estimate = estimateOf(experiment, request)
      const selection = selectionOf(experiment)
      const fixture: SeriesFixture = {
        key: nextKey(`${experiment.id}/${request.on}`),
        origin: { kind: "experiment", experiment: experiment.id },
        flow: experiment.subject.kind === "arm" ? null : experiment.subject.flow,
        on: request.on,
        caseNames: selection.slice(0, Math.max(1, request.cases)).map((item) => item.name),
        repeats: request.repeats,
        status: estimate.needsApproval ? "awaiting_approval" : "running",
        done: 0,
        startedAt: ids.isoDateTime(clock().toISOString()),
        finishedAt: null,
        models: experiment.models,
        waiting: {},
      }
      fixtures = [...fixtures, fixture]
      return seriesIdOf(fixture.key)
    },
    approveSeries: (id) => moveTo(id, (status) => status === "awaiting_approval", "running", false),
    cancelSeries: (id) => moveTo(id, isActive, "cancelled", true),
    series: (id) => {
      const fixture = fixtureOf(id)
      return fixture === null ? null : detailOf(fixture)
    },
    seriesCases: (id, filter) => {
      const fixture = fixtureOf(id)
      return fixture === null ? null : seriesCases(fixture, contextOf(fixture), filter)
    },
    seriesOfExperiment: (id) => (experimentOf(id) === null ? null : summariesOf(id)),
    startLook: (flow, dataset, caseNames) => {
      const known = datasetOf(dataset)
      if (known === null) return null
      const names = known.cases.filter((item) => caseNames.includes(item.name)).map((item) => item.name)
      const fixture: SeriesFixture = {
        key: nextKey(`look/${flow}`),
        origin: { kind: "look", dataset: known.id, cases: names },
        flow,
        on: "dev",
        caseNames: names,
        repeats: 1,
        status: "done",
        done: null,
        startedAt: ids.isoDateTime(clock().toISOString()),
        finishedAt: ids.isoDateTime(clock().toISOString()),
        models: { [LOOK_VARIANT]: LOOK_MODEL },
        waiting: {},
      }
      fixtures = [...fixtures, fixture]
      return seriesIdOf(fixture.key)
    },
    reset: () => {
      fixtures = [...SEEDS.map(seedFixture), LOOK_SERIES]
      counter = 0
    },
  }
}

export const RESEARCH_FIXTURE_SERIES = {
  replyNoninferiorDev: seriesIdOf("reply_noninferior_mistral/dev/1"),
  replyNoninferiorHoldout: seriesIdOf("reply_noninferior_mistral/holdout/1"),
  intentSplitHoldout: seriesIdOf("intent_split_long_messages/holdout/1"),
  critiquePlantedDev: seriesIdOf("critique_planted_defects/dev/1"),
  overpromiseAwaiting: seriesIdOf("reply_overpromise_risk/holdout/1"),
  escalationRunning: seriesIdOf("intent_escalation_agents/dev/1"),
  panelAgentsHoldout: seriesIdOf("judge_panel_agents/holdout/1"),
  singleJudgeCancelled: seriesIdOf("panel_single_judge/dev/1"),
  singleJudgeFailed: seriesIdOf("panel_single_judge/holdout/1"),
  lookWaiting: seriesIdOf(LOOK_SERIES.key),
} as const
