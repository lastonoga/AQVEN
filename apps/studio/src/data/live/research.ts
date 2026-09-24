import type {
  ArmFlow,
  ArmId,
  DatasetId,
  ExperimentDetail,
  ExperimentFilter,
  ExperimentId,
  ExperimentSummary,
  FlowId,
  LaunchEstimate,
  LaunchRequest,
  NodeRange,
  SeriesCaseFilter,
  SeriesCaseRow,
  SeriesDetail,
  SeriesId,
  SeriesSummary,
} from "@/domain"
import { api, unwrap } from "@/api/client"
import * as ids from "@/data/ids"
import { everyPage, MAX_PAGE } from "./paging"
import {
  armFlowOf,
  caseRowOf,
  estimateOf,
  experimentDetailOf,
  experimentSummaryOf,
  launchBody,
  seriesDetailOf,
  seriesSummaryOf,
} from "./research-adapter"

export type ResearchSource = {
  readonly experiments: (filter?: ExperimentFilter) => Promise<readonly ExperimentSummary[]>
  readonly experiment: (id: ExperimentId) => Promise<ExperimentDetail>
  readonly armFlow: (id: ExperimentId, arm: ArmId) => Promise<ArmFlow>
  readonly estimate: (id: ExperimentId, request: LaunchRequest) => Promise<LaunchEstimate>
  readonly startSeries: (id: ExperimentId, request: LaunchRequest) => Promise<SeriesId>
  readonly approveSeries: (id: SeriesId, capUsd?: number) => Promise<SeriesSummary>
  readonly cancelSeries: (id: SeriesId, reason?: string) => Promise<SeriesSummary>
  readonly series: (id: SeriesId) => Promise<SeriesDetail>
  readonly seriesCases: (id: SeriesId, filter?: SeriesCaseFilter) => Promise<readonly SeriesCaseRow[]>
  readonly seriesOfExperiment: (id: ExperimentId) => Promise<readonly SeriesSummary[]>
  readonly allSeries: () => Promise<readonly SeriesSummary[]>
  readonly startLook: (flowId: FlowId, datasetId: DatasetId, caseNames: readonly string[], stages?: NodeRange | null) => Promise<SeriesId>
}

const NO_FILTER: ExperimentFilter = {}
const NO_CASE_FILTER: SeriesCaseFilter = {}

const experimentQuery = (filter: ExperimentFilter, cursor: string | null) => ({
  question: filter.question ?? null,
  failure_mode: filter.failureMode ?? null,
  cursor,
  limit: MAX_PAGE,
})

const caseQuery = (filter: SeriesCaseFilter) => ({ failures: filter.failures ?? false, divergent: filter.divergent ?? false })

const stagesBody = (stages: NodeRange | null) => (stages === null ? {} : { start_node: stages.from, end_node: stages.to })

export const research: ResearchSource = {
  experiments: async (filter = NO_FILTER) => {
    const rows = await everyPage(async (cursor) => unwrap(await api.GET("/api/experiments", { params: { query: experimentQuery(filter, cursor) } })))
    return rows.map(experimentSummaryOf)
  },
  experiment: async (id) =>
    experimentDetailOf(unwrap(await api.GET("/api/experiments/{experiment_id}", { params: { path: { experiment_id: id } } }))),
  armFlow: async (id, arm) =>
    armFlowOf(unwrap(await api.GET("/api/experiments/{experiment_id}/arms/{arm_id}", { params: { path: { experiment_id: id, arm_id: arm } } }))),
  estimate: async (id, request) =>
    estimateOf(unwrap(await api.POST("/api/experiments/{experiment_id}/estimate", { params: { path: { experiment_id: id } }, body: launchBody(request) }))),
  startSeries: async (id, request) => {
    const started = unwrap(await api.POST("/api/series", { body: { ...launchBody(request), experiment_id: id } }))
    return ids.seriesId(started.series_id)
  },
  approveSeries: async (id, capUsd) =>
    seriesSummaryOf(unwrap(await api.POST("/api/series/{series_id}/approve", { params: { path: { series_id: id } }, body: { cap_usd: capUsd ?? null } }))),
  cancelSeries: async (id, reason) =>
    seriesSummaryOf(unwrap(await api.POST("/api/series/{series_id}/cancel", { params: { path: { series_id: id } }, body: { reason: reason ?? null } }))),
  series: async (id) =>
    seriesDetailOf(unwrap(await api.GET("/api/series/{series_id}", { params: { path: { series_id: id } } })).series),
  seriesCases: async (id, filter = NO_CASE_FILTER) => {
    const rows = unwrap(await api.GET("/api/series/{series_id}/cases", { params: { path: { series_id: id }, query: caseQuery(filter) } }))
    return rows.map(caseRowOf)
  },
  seriesOfExperiment: async (id) => {
    const rows = await everyPage(async (cursor) =>
      unwrap(await api.GET("/api/series", { params: { query: { experiment_id: id, cursor, limit: MAX_PAGE } } })))
    return rows.map(seriesSummaryOf)
  },
  allSeries: async () => {
    const rows = await everyPage(async (cursor) => unwrap(await api.GET("/api/series", { params: { query: { cursor, limit: MAX_PAGE } } })))
    return rows.map(seriesSummaryOf)
  },
  startLook: async (flowId, datasetId, caseNames, stages = null) => {
    const started = unwrap(await api.POST("/api/series", {
      body: { on: "dev", look: { flow_id: flowId, dataset_id: datasetId, case_names: [...caseNames], ...stagesBody(stages) } },
    }))
    return ids.seriesId(started.series_id)
  },
}
