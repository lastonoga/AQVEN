import type {
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
  SeriesId,
  SeriesSummary,
} from "@/domain"
import { apiError } from "@/api/client"
import { createResearchStore, type ResearchStore } from "@/data/fixtures/research"

export type ResearchSource = {
  readonly experiments: (filter?: ExperimentFilter) => Promise<readonly ExperimentSummary[]>
  readonly experiment: (id: ExperimentId) => Promise<ExperimentDetail>
  readonly estimate: (id: ExperimentId, request: LaunchRequest) => Promise<LaunchEstimate>
  readonly startSeries: (id: ExperimentId, request: LaunchRequest) => Promise<SeriesId>
  readonly approveSeries: (id: SeriesId) => Promise<SeriesSummary>
  readonly cancelSeries: (id: SeriesId) => Promise<SeriesSummary>
  readonly series: (id: SeriesId) => Promise<SeriesDetail>
  readonly seriesCases: (id: SeriesId, filter?: SeriesCaseFilter) => Promise<readonly SeriesCaseRow[]>
  readonly seriesOfExperiment: (id: ExperimentId) => Promise<readonly SeriesSummary[]>
  readonly startLook: (flowId: FlowId, datasetId: DatasetId, caseNames: readonly string[]) => Promise<SeriesId>
}

const NOT_FOUND = 404
const INPUT_INVALID = 422
const NO_FILTER = {}

const missing = (op: string, what: string): Error =>
  apiError(NOT_FOUND, { ok: false, op, code: "NOT_FOUND", message: `${what} not found`, problems: [], retry_after_ms: null })

const invalid = (op: string, message: string): Error =>
  apiError(INPUT_INVALID, { ok: false, op, code: "INPUT_INVALID", message, problems: [], retry_after_ms: null })

const found = <T>(value: T | null, op: string, what: string): Promise<T> => {
  if (value === null) return Promise.reject(missing(op, what))
  return Promise.resolve(value)
}

const validRequest = (request: LaunchRequest): boolean =>
  Number.isInteger(request.cases) && Number.isInteger(request.repeats) && request.cases > 0 && request.repeats > 0

export const researchSource = (store: ResearchStore): ResearchSource => ({
  experiments: (filter = NO_FILTER) => Promise.resolve(store.experiments(filter)),
  experiment: (id) => found(store.experiment(id), "experiment_get", `Experiment ${id}`),
  estimate: (id, request) => {
    if (!validRequest(request)) return Promise.reject(invalid("series_estimate", "cases and repeats must be positive integers"))
    return found(store.estimate(id, request), "series_estimate", `Experiment ${id}`)
  },
  startSeries: (id, request) => {
    if (!validRequest(request)) return Promise.reject(invalid("series_start", "cases and repeats must be positive integers"))
    return found(store.startSeries(id, request), "series_start", `Experiment ${id}`)
  },
  approveSeries: (id) => found(store.approveSeries(id), "series_approve", `Series ${id}`),
  cancelSeries: (id) => found(store.cancelSeries(id), "series_cancel", `Series ${id}`),
  series: (id) => found(store.series(id), "series_get", `Series ${id}`),
  seriesCases: (id, filter = NO_FILTER) => found(store.seriesCases(id, filter), "series_cases", `Series ${id}`),
  seriesOfExperiment: (id) => found(store.seriesOfExperiment(id), "series_list", `Experiment ${id}`),
  startLook: (flowId, datasetId, caseNames) => {
    if (caseNames.length === 0) return Promise.reject(invalid("series_start", "select at least one case"))
    return found(store.startLook(flowId, datasetId, caseNames), "series_start", `Dataset ${datasetId}`)
  },
})

export const researchStore = createResearchStore()

export const research = researchSource(researchStore)
