import type {
  ApiSeriesEvent,
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
  SeriesCaseFilter,
  SeriesCaseRow,
  SeriesDetail,
  SeriesEvent,
  SeriesId,
  SeriesSummary,
} from "@/domain"
import { API_BASE, api, unwrap } from "@/api/client"
import * as ids from "@/data/ids"
import { isRecord, subscribeEvents, type Unsubscribe } from "@/lib/sse"
import { everyPage, MAX_PAGE } from "./paging"
import {
  armFlowOf,
  caseRowOf,
  estimateOf,
  experimentDetailOf,
  experimentSummaryOf,
  launchBody,
  seriesDetailOf,
  seriesEventOf,
  seriesSummaryOf,
} from "./research-adapter"

export type ResearchSource = {
  readonly experiments: (filter?: ExperimentFilter) => Promise<readonly ExperimentSummary[]>
  readonly experiment: (id: ExperimentId) => Promise<ExperimentDetail>
  readonly armFlow: (id: ExperimentId, arm: ArmId) => Promise<ArmFlow>
  readonly estimate: (id: ExperimentId, request: LaunchRequest) => Promise<LaunchEstimate>
  readonly startSeries: (id: ExperimentId, request: LaunchRequest) => Promise<SeriesId>
  readonly approveSeries: (id: SeriesId) => Promise<SeriesSummary>
  readonly cancelSeries: (id: SeriesId, reason?: string) => Promise<SeriesSummary>
  readonly series: (id: SeriesId) => Promise<SeriesDetail>
  readonly seriesCases: (id: SeriesId, filter?: SeriesCaseFilter) => Promise<readonly SeriesCaseRow[]>
  readonly seriesOfExperiment: (id: ExperimentId) => Promise<readonly SeriesSummary[]>
  readonly allSeries: (flow?: FlowId) => Promise<readonly SeriesSummary[]>
  readonly startLook: (flowId: FlowId, datasetId: DatasetId, caseNames: readonly string[]) => Promise<SeriesId>
  readonly events: SeriesEventStream
}

export type SeriesEventStream = (id: SeriesId, afterSeq: number, onEvent: (event: SeriesEvent) => void) => Unsubscribe

const NO_FILTER: ExperimentFilter = {}
const NO_CASE_FILTER: SeriesCaseFilter = {}

export const SERIES_EVENT_TYPES: readonly ApiSeriesEvent["type"][] = ["series_status", "attempt_finished", "series_finished"]

const isSeriesEventType = (value: unknown): value is ApiSeriesEvent["type"] => SERIES_EVENT_TYPES.some((type) => type === value)

const isSeriesEvent = (value: unknown): value is ApiSeriesEvent =>
  isRecord(value) && typeof value["seq"] === "number" && typeof value["series_id"] === "string" && isSeriesEventType(value["type"])

export const readSeriesEvent = (id: SeriesId) => (value: unknown): SeriesEvent | null =>
  isSeriesEvent(value) && value.series_id === id ? seriesEventOf(value) : null

export const seriesEventsUrl = (id: SeriesId, afterSeq: number): string =>
  `${API_BASE}/series/${encodeURIComponent(id)}/events?after_seq=${String(afterSeq)}`

export const seriesEventStream: SeriesEventStream = (id, afterSeq, onEvent) =>
  subscribeEvents({ url: seriesEventsUrl(id, afterSeq), types: SERIES_EVENT_TYPES, read: readSeriesEvent(id), onEvent })

const experimentQuery = (filter: ExperimentFilter, cursor: string | null) => ({
  flow_id: filter.flow ?? null,
  question: filter.question ?? null,
  failure_mode: filter.failureMode ?? null,
  cursor,
  limit: MAX_PAGE,
})

const caseQuery = (filter: SeriesCaseFilter) => ({ failures: filter.failures ?? false, divergent: filter.divergent ?? false })

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
  approveSeries: async (id) =>
    seriesSummaryOf(unwrap(await api.POST("/api/series/{series_id}/approve", { params: { path: { series_id: id } } }))),
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
  allSeries: async (flow) => {
    const rows = await everyPage(async (cursor) =>
      unwrap(await api.GET("/api/series", { params: { query: { flow_id: flow ?? null, cursor, limit: MAX_PAGE } } })))
    return rows.map(seriesSummaryOf)
  },
  startLook: async (flowId, datasetId, caseNames) => {
    const started = unwrap(await api.POST("/api/series", {
      body: { on: "dev", look: { flow_id: flowId, dataset_id: datasetId, case_names: [...caseNames] } },
    }))
    return ids.seriesId(started.series_id)
  },
  events: seriesEventStream,
}
