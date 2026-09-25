import { delay, http, HttpResponse, type JsonBodyType, type PathParams } from "msw"
import type {
  ApiExperimentDetail,
  ApiExperimentFlow,
  ApiLocalFlow,
  ApiExperimentSummary,
  ApiNode,
  ApiPromptDetail,
  ApiRunSnapshot,
  ApiSeriesCaseRow,
  AttentionReason,
  SeriesSplit,
  SeriesStatus,
} from "@/domain"
import { ATTENTION_REASONS } from "@/domain"
import { API_BASE } from "@/api/client"
import { authoredCases, createdExperiments, resetAuthoringMocks } from "./authoring"
import { liveDatasets } from "./data/datasets"
import { liveExperiments } from "./data/experiments"
import {
  attemptRun,
  attemptsOf,
  caseRowsOf,
  CASE_NAMES,
  datasetOf,
  detailOf,
  experimentOf,
  initialSeries,
  launchPlanFor,
  localFlowOf,
  subjectFlowOf,
  summaryOf,
  type Attempt,
  type LaunchBody,
  type LookSeed,
  type LookStages,
  type SeriesState,
} from "./data/research"

const LATENCY_MS = 20
const CREATED = 201
const NOT_FOUND = 404
const CONFLICT = 409
const UNPROCESSABLE = 422
const HUMAN = "local"
const SETTLED: ReadonlySet<SeriesStatus> = new Set<SeriesStatus>(["done", "cancelled", "failed"])
const LIVE: ReadonlySet<SeriesStatus> = new Set<SeriesStatus>(["running", "waiting_human"])
const FILE_REASONS: ReadonlySet<AttentionReason> = new Set<AttentionReason>(["results_stale", "check_errors"])

let states: readonly SeriesState[] = initialSeries()
let started = 0

export const resetResearchMocks = (): void => {
  states = initialSeries()
  started = 0
  resetAuthoringMocks()
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

const stagesOf = (look: Readonly<Record<string, unknown>>): LookStages | null => {
  const start = textAt(look, "start_node")
  const end = textAt(look, "end_node")
  return start === "" || end === "" ? null : { start, end }
}

const lookOf = (body: unknown): LookSeed | null => {
  if (!isRecord(body) || !isRecord(body["look"])) return null
  const look = body["look"]
  const names = Array.isArray(look["case_names"]) ? look["case_names"].filter((name): name is string => typeof name === "string") : []
  return { flow: textAt(look, "flow_id"), dataset: textAt(look, "dataset_id"), cases: names, stages: stagesOf(look) }
}

const byStart = (left: SeriesState, right: SeriesState): number => Date.parse(right.startedAt) - Date.parse(left.startedAt)

const seriesOf = (experimentId: string): readonly SeriesState[] => states.filter((series) => series.experiment === experimentId).sort(byStart)

const findSeries = (id: string): SeriesState | null => states.find((series) => series.id === id) ?? null

const replace = (next: SeriesState): SeriesState => {
  states = states.map((series) => (series.id === next.id ? next : series))
  return next
}

type ActivityFields = Pick<ApiExperimentSummary, "last_activity" | "activity_source" | "running" | "attention">

const touchedAt = (series: SeriesState): string => series.finishedAt ?? series.startedAt

const later = (left: string | null, right: string): string => (left === null || Date.parse(right) > Date.parse(left) ? right : left)

const seriesReasons = (series: readonly SeriesState[]): readonly AttentionReason[] => [
  ...(series.some((item) => item.status === "awaiting_approval") ? (["spend_cap_pause"] as const) : []),
  ...(series[0]?.verdict?.state === "invalid" ? (["series_invalid"] as const) : []),
]

const activityOf = (experiment: ApiExperimentDetail, series: readonly SeriesState[]): ActivityFields => {
  const touched = series.reduce<string | null>((newest, item) => later(newest, touchedAt(item)), null)
  const files = experiment.last_activity
  const seriesNewer = touched !== null && (files === null || Date.parse(touched) > Date.parse(files))
  const reasons = new Set([...seriesReasons(series), ...experiment.attention.filter((reason) => FILE_REASONS.has(reason))])
  return {
    last_activity: seriesNewer ? touched : files,
    activity_source: seriesNewer ? "series" : experiment.activity_source,
    running: series.some((item) => LIVE.has(item.status)),
    attention: ATTENTION_REASONS.filter((reason) => reasons.has(reason)),
  }
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
    archived: experiment.archived,
    created: experiment.created,
    ...activityOf(experiment, series),
  }
}

const detailOfExperiment = (experiment: ApiExperimentDetail): ApiExperimentDetail => ({ ...experiment, ...summaryOfExperiment(experiment), cases: authoredCases(experiment) })

const knownExperiments = (): readonly ApiExperimentDetail[] => [...liveExperiments, ...createdExperiments()]

const findExperiment = (id: string): ApiExperimentDetail | null => experimentOf(id) ?? createdExperiments().find((experiment) => experiment.experiment_id === id) ?? null

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
  const launch = launchPlanFor(experiment, body)
  const names = (CASE_NAMES[experiment.cases.dataset_id]?.[launch.on] ?? []).slice(0, launch.cases)
  const series = freshSeries({
    experiment: experiment.experiment_id,
    look: null,
    on: launch.on,
    repeats: launch.repeats,
    cases: names,
    status: launch.needs_approval ? "awaiting_approval" : "running",
  })
  states = [...states, series]
  return { ...summaryOf(series), launch }
}

const startLook = (look: LookSeed) => {
  const series = freshSeries({ experiment: null, look, on: "dev", repeats: 1, cases: look.cases, status: "running" })
  states = [...states, series]
  return { ...summaryOf(series), launch: detailOf(series).launch }
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

type FlowStep = ApiLocalFlow["steps"][number]

type StepExecution = ApiRunSnapshot["executions"][number]

const stepExecution = (step: FlowStep, template: ApiRunSnapshot): readonly StepExecution[] => {
  const shape = template.executions.find((execution) => execution.kind === step.kind && execution.address.node_id.indexOf("__") < 0)
  if (shape === undefined) return []
  return [{ ...shape, address: { ...shape.address, node_id: step.node_id }, agent: null, inference: null }]
}

const localTrace = (series: SeriesState, template: ApiRunSnapshot): Pick<ApiRunSnapshot, "order" | "executions"> => {
  const flow = localFlowOf(series)
  if (flow === null) return { order: template.order, executions: template.executions }
  return { order: flow.steps.map((step) => step.node_id), executions: flow.steps.flatMap((step) => stepExecution(step, template)) }
}

const stepFolder = (experimentId: string, flow: ApiLocalFlow, step: FlowStep): string => `experiments/${experimentId}/flows/${flow.flow_id}/nodes/${step.node_id}`

const stepNode = (experimentId: string, flow: ApiLocalFlow, step: FlowStep, index: number): ApiNode => ({
  node_id: step.node_id,
  local_id: step.node_id,
  parent: null,
  kind: step.kind,
  path: `${stepFolder(experimentId, flow, step)}/${step.node_id}.node.yaml`,
  file_hash: "",
  agent: step.agent?.agent_id ?? null,
  inference: step.kind === "llm" ? step.node_id : null,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: flow.steps.slice(0, index).map((item) => item.node_id),
  downstream: flow.steps.slice(index + 1).map((item) => item.node_id),
})

const textField = (description: string) => ({ type: "string", description })

const STEP_INPUT = { type: "object", properties: { message: textField("Case text the customer wrote") }, required: ["message"] }

const STEP_OUTPUT = {
  type: "object",
  properties: { rationale: textField("Why this intent"), intent: textField("Intent of the case"), confidence: { type: "number", description: "Confidence from 0 to 1" } },
  required: ["rationale", "intent", "confidence"],
}

const stepSchemas = (flow: ApiLocalFlow) =>
  Object.fromEntries(flow.steps.map((step, index) => [step.node_id, { in: index === 0 ? STEP_INPUT : STEP_OUTPUT, out: STEP_OUTPUT, form: null }]))

const STEP_PROMPT_TEXT = "{% message system %}\nYou decide the intent of a case to the support desk.\n{% endmessage %}\n{% message user %}\n{{ message }}\n{{ output_format }}\n{% endmessage %}\n"

const stepPrompt = (experimentId: string, flow: ApiLocalFlow, step: FlowStep): ApiPromptDetail => ({
  flow_id: flow.flow_id,
  node_id: step.node_id,
  inference_id: step.node_id,
  level: 2,
  path: `${stepFolder(experimentId, flow, step)}/${step.node_id}.prompt.md`,
  file_hash: null,
  builder_ref: null,
  has_draft: false,
  draft_stale: false,
  problems_count: 0,
  source: { text: STEP_PROMPT_TEXT, file_hash: null },
  analysis: null,
  slots: [{ name: "message", type_id: "Text", used: true }],
  unused_inputs: [],
  variant_files: [],
  problems: [],
})

const stepPrompts = (experimentId: string, flow: ApiLocalFlow): Readonly<Record<string, ApiPromptDetail>> =>
  Object.fromEntries(flow.steps.filter((step) => step.kind === "llm").map((step) => [step.node_id, stepPrompt(experimentId, flow, step)]))

const experimentFlowOf = (experiment: ApiExperimentDetail, flow: ApiLocalFlow): ApiExperimentFlow => ({
  experiment_id: experiment.experiment_id,
  flow_id: flow.flow_id,
  description: flow.description,
  order: flow.steps.map((step) => step.node_id),
  nodes: flow.steps.map((step, index) => stepNode(experiment.experiment_id, flow, step, index)),
  schemas: { flow_id: flow.flow_id, input: null, output: null, context: [], nodes: stepSchemas(flow) },
  prompts: stepPrompts(experiment.experiment_id, flow),
})

const attemptSnapshot = (series: SeriesState, attempt: Attempt, template: ApiRunSnapshot): ApiRunSnapshot => ({
  ...template,
  ...localTrace(series, template),
  experiment_id: series.experiment,
  flow_experiment_id: localFlowOf(series) === null ? null : series.experiment,
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
    return served(page(knownExperiments().filter((experiment) => matchesExperiment(experiment, url)).map(summaryOfExperiment)))
  }),

  http.get(`${API_BASE}/experiments/:experimentId`, ({ params }) => {
    const experiment = findExperiment(text(params, "experimentId"))
    return experiment === null ? failure(NOT_FOUND, "experiment_get", "NOT_FOUND", `experiment ${text(params, "experimentId")} not found`) : served(detailOfExperiment(experiment))
  }),

  http.get(`${API_BASE}/experiments/:experimentId/flows/:flowId`, ({ params }) => {
    const experiment = experimentOf(text(params, "experimentId"))
    const flow = experiment?.flows.find((item) => item.flow_id === text(params, "flowId"))
    if (experiment === null || flow === undefined) return failure(NOT_FOUND, "experiment_flow", "NOT_FOUND", `flow ${text(params, "flowId")} not found`)
    return served(experimentFlowOf(experiment, flow))
  }),

  http.post(`${API_BASE}/experiments/:experimentId/launch-plan`, async ({ params, request }) => {
    const experiment = experimentOf(text(params, "experimentId"))
    if (experiment === null) return failure(NOT_FOUND, "series_launch_plan", "NOT_FOUND", `experiment ${text(params, "experimentId")} not found`)
    return served(launchPlanFor(experiment, launchOf(await request.json())))
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
    const query = new URL(request.url).searchParams
    const experimentId = query.get("experiment_id")
    const flowId = query.get("flow_id")
    const rows = (experimentId === null ? [...states].sort(byStart) : seriesOf(experimentId)).map(summaryOf)
    return served(page(flowId === null ? rows : rows.filter((row) => row.flow_id === flowId)))
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

