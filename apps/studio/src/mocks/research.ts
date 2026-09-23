import { delay, http, HttpResponse, type JsonBodyType, type PathParams } from "msw"
import type { ApiArm, ApiArmFlow, ApiExperimentDetail, ApiExperimentSummary, ApiNode, ApiRunSnapshot, ApiSeriesCaseRow, SeriesSplit, SeriesStatus } from "@/domain"
import { API_BASE } from "@/api/client"
import { liveDatasets } from "./data/datasets"
import { liveExperiments } from "./data/experiments"
import {
  armOf,
  attemptRun,
  attemptsOf,
  caseRowsOf,
  CASE_NAMES,
  datasetOf,
  detailOf,
  estimateFor,
  experimentOf,
  initialSeries,
  subjectFlowOf,
  summaryOf,
  type Attempt,
  type LaunchBody,
  type LookSeed,
  type SeriesState,
} from "./data/research"

const LATENCY_MS = 20
const CREATED = 201
const NOT_FOUND = 404
const CONFLICT = 409
const UNPROCESSABLE = 422
const HUMAN = "local"
const SETTLED: ReadonlySet<SeriesStatus> = new Set<SeriesStatus>(["done", "cancelled", "failed"])

let states: readonly SeriesState[] = initialSeries()
let started = 0

export const resetResearchMocks = (): void => {
  states = initialSeries()
  started = 0
}

const text = (params: PathParams, name: string): string => {
  const value = params[name]
  return typeof value === "string" ? value : ""
}

const served = async (body: JsonBodyType, status = 200): Promise<Response> => {
  await delay(LATENCY_MS)
  return HttpResponse.json(body, { status })
}

const failure = (status: number, op: string, code: string, message: string): Response =>
  HttpResponse.json({ ok: false, op, code, message, problems: [], candidates: [], conflict: null, retry_after_ms: null }, { status })

const page = <T>(items: readonly T[]) => ({ items, next_cursor: null, total_estimate: items.length })

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

const numberAt = (body: Readonly<Record<string, unknown>>, key: string): number | null => {
  const value = body[key]
  return typeof value === "number" ? value : null
}

const splitAt = (body: Readonly<Record<string, unknown>>): SeriesSplit => (body["on"] === "holdout" ? "holdout" : "dev")

const launchOf = (body: unknown): LaunchBody => {
  if (!isRecord(body)) return { on: "dev" }
  return { on: splitAt(body), cases: numberAt(body, "cases"), repeats: numberAt(body, "repeats") }
}

const textAt = (body: Readonly<Record<string, unknown>>, key: string): string => {
  const value = body[key]
  return typeof value === "string" ? value : ""
}

const lookOf = (body: unknown): LookSeed | null => {
  if (!isRecord(body) || !isRecord(body["look"])) return null
  const look = body["look"]
  const names = Array.isArray(look["case_names"]) ? look["case_names"].filter((name): name is string => typeof name === "string") : []
  return { flow: textAt(look, "flow_id"), dataset: textAt(look, "dataset_id"), cases: names }
}

const byStart = (left: SeriesState, right: SeriesState): number => Date.parse(right.startedAt) - Date.parse(left.startedAt)

const seriesOf = (experimentId: string): readonly SeriesState[] => states.filter((series) => series.experiment === experimentId).sort(byStart)

const findSeries = (id: string): SeriesState | null => states.find((series) => series.id === id) ?? null

const replace = (next: SeriesState): SeriesState => {
  states = states.map((series) => (series.id === next.id ? next : series))
  return next
}

const summaryOfExperiment = (experiment: ApiExperimentDetail): ApiExperimentSummary => {
  const series = seriesOf(experiment.experiment_id)
  const latest = series[0]
  const spent = series.reduce((total, item) => total + Number(summaryOf(item).spend.usd), 0)
  return {
    experiment_id: experiment.experiment_id,
    description: experiment.description,
    flow_id: experiment.flow_id,
    subject: experiment.subject,
    failure_mode: experiment.failure_mode,
    question: experiment.question,
    variants: experiment.variants,
    baseline: experiment.baseline,
    candidate: experiment.candidate,
    latest: latest === undefined ? null : { series_id: latest.id, on: latest.on, status: latest.status, verdict: latest.verdict?.state ?? null },
    series_count: series.length,
    spent_usd: spent.toFixed(4),
  }
}

const detailOfExperiment = (experiment: ApiExperimentDetail): ApiExperimentDetail => ({ ...experiment, ...summaryOfExperiment(experiment) })

const matchesExperiment = (experiment: ApiExperimentDetail, url: URL): boolean => {
  const flow = url.searchParams.get("flow_id")
  const question = url.searchParams.get("question")
  const mode = url.searchParams.get("failure_mode")
  return (flow === null || experiment.flow_id === flow) && (question === null || experiment.question === question) && (mode === null || experiment.failure_mode === mode)
}

const nextId = (): string => {
  started += 1
  return `01a0c200-0000-7000-8000-${String(started).padStart(12, "0")}`
}

const now = (): string => new Date().toISOString()

const freshSeries = (fields: Pick<SeriesState, "experiment" | "look" | "on" | "repeats" | "cases" | "status">): SeriesState => ({
  ...fields,
  id: nextId(),
  done: 0,
  verdict: null,
  startedAt: now(),
  finishedAt: null,
  passRates: {},
  cellVerdict: "pass",
  waiting: {},
  errorEvery: 0,
  unpriced: 0,
  approvedBy: null,
})

const startExperiment = (experiment: ApiExperimentDetail, body: LaunchBody) => {
  const estimate = estimateFor(experiment, body)
  const names = (CASE_NAMES[experiment.cases.dataset_id]?.[estimate.on] ?? []).slice(0, estimate.cases)
  const series = freshSeries({
    experiment: experiment.experiment_id,
    look: null,
    on: estimate.on,
    repeats: estimate.repeats,
    cases: names,
    status: estimate.needs_approval ? "awaiting_approval" : "running",
  })
  states = [...states, series]
  return { ...summaryOf(series), estimate }
}

const startLook = (look: LookSeed) => {
  const series = freshSeries({ experiment: null, look, on: "dev", repeats: 1, cases: look.cases, status: "running" })
  states = [...states, series]
  return { ...summaryOf(series), estimate: detailOf(series).estimate }
}

const CASE_FILTERS: Readonly<Record<string, (row: ApiSeriesCaseRow) => boolean>> = {
  failures: (row) => row.failing,
  divergent: (row) => row.divergent,
}

const filteredRows = (series: SeriesState, url: URL): readonly ApiSeriesCaseRow[] => {
  const active = Object.entries(CASE_FILTERS).filter(([key]) => url.searchParams.get(key) === "true").map(([, keep]) => keep)
  return caseRowsOf(series).filter((row) => active.every((keep) => keep(row)))
}

const cancelled = (series: SeriesState): SeriesState => {
  const summary = summaryOf(series)
  return {
    ...series,
    status: "cancelled",
    finishedAt: now(),
    verdict: { state: "invalid", reason: "cancelled", text: `No finding: cancelled after ${String(summary.progress.done)} of ${String(summary.progress.total)} attempts.` },
  }
}

const seriesEventsBody = (series: SeriesState): string =>
  `event: series_status\ndata: ${JSON.stringify({ seq: 1, at: series.startedAt, series_id: series.id, type: "series_status", status: series.status })}\nid: 1\n\n`

type ArmExecution = ApiRunSnapshot["executions"][number]

const armStepExecution = (step: ApiArm["steps"][number], template: ApiRunSnapshot): readonly ArmExecution[] => {
  const shape = template.executions.find((execution) => execution.kind === step.kind && execution.address.node_id.indexOf("__") < 0)
  if (shape === undefined) return []
  return [{ ...shape, address: { ...shape.address, node_id: step.node_id }, agent: null, inference: null }]
}

const armTrace = (series: SeriesState, template: ApiRunSnapshot): Pick<ApiRunSnapshot, "order" | "executions"> => {
  const arm = armOf(series)
  if (arm === null) return { order: template.order, executions: template.executions }
  return { order: arm.steps.map((step) => step.node_id), executions: arm.steps.flatMap((step) => armStepExecution(step, template)) }
}

const armNode = (experimentId: string, arm: ApiArm, step: ApiArm["steps"][number], index: number): ApiNode => ({
  node_id: step.node_id,
  local_id: step.node_id,
  parent: null,
  kind: step.kind,
  path: `experiments/${experimentId}/arms/${arm.arm_id}/nodes/${step.node_id}.node.yaml`,
  file_hash: "",
  agent: step.agent?.agent_id ?? null,
  inference: step.kind === "llm" ? step.node_id : null,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: arm.steps.slice(0, index).map((item) => item.node_id),
  downstream: arm.steps.slice(index + 1).map((item) => item.node_id),
})

const armFlowOf = (experiment: ApiExperimentDetail, arm: ApiArm): ApiArmFlow => ({
  experiment_id: experiment.experiment_id,
  arm_id: arm.arm_id,
  flow_id: arm.arm_id,
  description: arm.description,
  order: arm.steps.map((step) => step.node_id),
  nodes: arm.steps.map((step, index) => armNode(experiment.experiment_id, arm, step, index)),
  schemas: { flow_id: arm.arm_id, input: null, output: null, context: [], nodes: {} },
})

const attemptSnapshot = (series: SeriesState, attempt: Attempt, template: ApiRunSnapshot): ApiRunSnapshot => ({
  ...template,
  ...armTrace(series, template),
  experiment_id: series.experiment,
  arm_id: armOf(series)?.arm_id ?? null,
  run_id: attempt.run_id,
  execution_id: attempt.run_id,
  started_at: series.startedAt,
  flow_id: subjectFlowOf(series),
  mode: "experiment",
  status: attempt.outcome === "passed" || attempt.outcome === "failed" ? "completed" : "failed",
  series_id: series.id,
  dataset_item_id: `${datasetOf(series)}/${attempt.caseName}`,
  cost_usd: attempt.usd,
  lineage: null,
  waits: [],
})

export const researchRunSnapshot = (runId: string, template: ApiRunSnapshot | undefined): ApiRunSnapshot | undefined => {
  const found = attemptRun(states, runId)
  if (found === null || template === undefined) return undefined
  return attemptSnapshot(found.series, found.attempt, template)
}

export const researchRuns = (template: ApiRunSnapshot | undefined): readonly ApiRunSnapshot[] => {
  if (template === undefined) return []
  return [...states].sort(byStart).flatMap((series) => attemptsOf(series).map((attempt) => attemptSnapshot(series, attempt, template)))
}

export const researchHandlers = [
  http.get(`${API_BASE}/experiments`, ({ request }) => {
    const url = new URL(request.url)
    return served(page(liveExperiments.filter((experiment) => matchesExperiment(experiment, url)).map(summaryOfExperiment)))
  }),

  http.get(`${API_BASE}/experiments/:experimentId`, ({ params }) => {
    const experiment = experimentOf(text(params, "experimentId"))
    return experiment === null ? failure(NOT_FOUND, "experiment_get", "NOT_FOUND", `experiment ${text(params, "experimentId")} not found`) : served(detailOfExperiment(experiment))
  }),

  http.get(`${API_BASE}/experiments/:experimentId/arms/:armId`, ({ params }) => {
    const experiment = experimentOf(text(params, "experimentId"))
    const arm = experiment?.arms.find((item) => item.arm_id === text(params, "armId"))
    if (experiment === null || arm === undefined) return failure(NOT_FOUND, "experiment_arm", "NOT_FOUND", `arm ${text(params, "armId")} not found`)
    return served(armFlowOf(experiment, arm))
  }),

  http.post(`${API_BASE}/experiments/:experimentId/estimate`, async ({ params, request }) => {
    const experiment = experimentOf(text(params, "experimentId"))
    if (experiment === null) return failure(NOT_FOUND, "series_estimate", "NOT_FOUND", `experiment ${text(params, "experimentId")} not found`)
    return served(estimateFor(experiment, launchOf(await request.json())))
  }),

  http.post(`${API_BASE}/series`, async ({ request }) => {
    const body: unknown = await request.json()
    const look = lookOf(body)
    if (look !== null) {
      if (look.cases.length === 0) return failure(UNPROCESSABLE, "series_start", "INPUT_INVALID", "select at least one case")
      if (!liveDatasets.some((dataset) => dataset.dataset_id === look.dataset)) return failure(NOT_FOUND, "series_start", "NOT_FOUND", `dataset ${look.dataset} not found`)
      return served(startLook(look), CREATED)
    }
    const experimentId = isRecord(body) ? textAt(body, "experiment_id") : ""
    const experiment = experimentOf(experimentId)
    if (experiment === null) return failure(NOT_FOUND, "series_start", "NOT_FOUND", `experiment ${experimentId} not found`)
    return served(startExperiment(experiment, launchOf(body)), CREATED)
  }),

  http.get(`${API_BASE}/series`, ({ request }) => {
    const experimentId = new URL(request.url).searchParams.get("experiment_id")
    const rows = experimentId === null ? [...states].sort(byStart) : seriesOf(experimentId)
    return served(page(rows.map(summaryOf)))
  }),

  http.get(`${API_BASE}/series/:seriesId`, ({ params }) => {
    const series = findSeries(text(params, "seriesId"))
    if (series === null) return failure(NOT_FOUND, "series_get", "NOT_FOUND", `series ${text(params, "seriesId")} not found`)
    return served({ series: detailOf(series), cases: null, hidden_cases: 0 })
  }),

  http.get(`${API_BASE}/series/:seriesId/cases`, ({ params, request }) => {
    const series = findSeries(text(params, "seriesId"))
    if (series === null) return failure(NOT_FOUND, "series_cases", "NOT_FOUND", `series ${text(params, "seriesId")} not found`)
    return served(filteredRows(series, new URL(request.url)))
  }),

  http.get(`${API_BASE}/series/:seriesId/events`, ({ params }) => {
    const series = findSeries(text(params, "seriesId"))
    if (series === null) return failure(NOT_FOUND, "series_events", "NOT_FOUND", `series ${text(params, "seriesId")} not found`)
    return new HttpResponse(seriesEventsBody(series), { headers: { "Content-Type": "text/event-stream" } })
  }),

  http.post(`${API_BASE}/series/:seriesId/approve`, ({ params }) => {
    const series = findSeries(text(params, "seriesId"))
    if (series === null) return failure(NOT_FOUND, "series_approve", "NOT_FOUND", `series ${text(params, "seriesId")} not found`)
    if (series.status !== "awaiting_approval") return failure(CONFLICT, "series_approve", "SERIES_STATE_CONFLICT", `series is ${series.status}`)
    return served(summaryOf(replace({ ...series, status: "running", approvedBy: HUMAN })))
  }),

  http.post(`${API_BASE}/series/:seriesId/cancel`, ({ params }) => {
    const series = findSeries(text(params, "seriesId"))
    if (series === null) return failure(NOT_FOUND, "series_cancel", "NOT_FOUND", `series ${text(params, "seriesId")} not found`)
    if (SETTLED.has(series.status)) return failure(CONFLICT, "series_cancel", "SERIES_STATE_CONFLICT", `series is ${series.status}`)
    return served(summaryOf(replace(cancelled(series))))
  }),
]

