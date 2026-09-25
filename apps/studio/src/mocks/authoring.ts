import { delay, http, HttpResponse, type JsonBodyType } from "msw"
import type { components } from "@/api/schema"
import type { ApiCaseSelection, ApiExperimentDetail } from "@/domain"
import { API_BASE } from "@/api/client"
import { AUTHORING_EVALUATORS, AUTHORING_METRICS, authoringDatasets, CALL_TARGETS, type AuthoringCase, type AuthoringDatasetSeed } from "./data/authoring"
import { liveExperiments } from "./data/experiments"
import { liveNodeDetails, liveNodes } from "./data/nodes"
import { liveFlowDetails, liveFlows } from "./data/project"

type S = components["schemas"]

type Json = Readonly<Record<string, unknown>>

type Tags = Readonly<Record<string, string>>

const LATENCY_MS = 20
const CREATED = 201
const NOT_FOUND = 404
const PRECONDITION_FAILED = 412
const UNPROCESSABLE = 422
const FILES_PREFIX = `${API_BASE}/files/`
const NAME = /^[a-z][a-z0-9_]*$/
const QUESTION_KINDS = ["look", "threshold", "compare", "noninferior"] as const

let casesOverrides: ReadonlyMap<string, ApiCaseSelection> = new Map()
let revisions: ReadonlyMap<string, number> = new Map()
let created: readonly ApiExperimentDetail[] = []

export const resetAuthoringMocks = (): void => {
  casesOverrides = new Map()
  revisions = new Map()
  created = []
}

export const touchExperimentFile = (experimentId: string): void => {
  revisions = new Map([...revisions, [experimentId, (revisions.get(experimentId) ?? 0) + 1]])
}

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value)

const textAt = (body: Json, key: string): string => {
  const value = body[key]
  return typeof value === "string" ? value : ""
}

const tagsAt = (body: Json, key: string): Tags => {
  const value = body[key]
  if (!isRecord(value)) return {}
  return Object.fromEntries(Object.entries(value).flatMap(([tag, tagValue]) => (typeof tagValue === "string" ? [[tag, tagValue]] : [])))
}

const served = async (body: JsonBodyType, status = 200): Promise<Response> => {
  await delay(LATENCY_MS)
  return HttpResponse.json(body, { status })
}

type Problem = { readonly path: readonly string[]; readonly code: string; readonly message: string }

const failure = (status: number, op: string, code: string, message: string, problems: readonly Problem[] = []): Response =>
  HttpResponse.json({ ok: false, op, code, message, problems, candidates: [], conflict: null, retry_after_ms: null }, { status })

const specPath = (experimentId: string): string => `experiments/${experimentId}/experiment.yaml`

const hashOf = (experimentId: string): string => `sha256-mock-${experimentId}-${String(revisions.get(experimentId) ?? 0)}`

const seedOf = (datasetId: string): AuthoringDatasetSeed | null => authoringDatasets.find((seed) => seed.datasetId === datasetId) ?? null

const matches = (tags: Tags) => (item: AuthoringCase): boolean => Object.entries(tags).every(([tag, value]) => item.tags[tag] === value)

const countOf = (seed: AuthoringDatasetSeed, tags: Tags): S["CaseCountView"] => {
  const selected = seed.cases.filter(matches(tags))
  return {
    selected: selected.length,
    total: seed.cases.length,
    splits: { dev: selected.filter((item) => item.split === "dev").length, holdout: selected.filter((item) => item.split === "holdout").length },
  }
}

const tagValues = (seed: AuthoringDatasetSeed): S["AuthoringDatasetView"]["tags"] => {
  const keys = [...new Set(seed.cases.flatMap((item) => Object.keys(item.tags)))].sort()
  return Object.fromEntries(
    keys.map((key) => {
      const values = [...new Set(seed.cases.flatMap((item) => item.tags[key] ?? []))].sort()
      return [key, values.map((value) => ({ value, count: seed.cases.filter((item) => item.tags[key] === value).length }))]
    }),
  )
}

const datasetOption = (seed: AuthoringDatasetSeed): S["AuthoringDatasetView"] => {
  const whole = countOf(seed, {})
  return { dataset_id: seed.datasetId, flow_id: seed.flowId, total: whole.total, splits: whole.splits, tags: tagValues(seed) }
}

const NESTING = "__"

const localNodeId = (nodeId: string): string => nodeId.split(NESTING).at(-1) ?? nodeId

const flowOption = (flow: (typeof liveFlows)[number]): S["AuthoringFlowView"] => ({
  flow_id: flow.flow_id,
  description: liveFlowDetails[flow.flow_id]?.description ?? "",
  input_type: flow.input_type,
  output_type: flow.output_type,
  nodes: (liveNodes[flow.flow_id] ?? []).map((node) => ({
    node_id: localNodeId(node.node_id),
    flow_node_id: node.node_id,
    kind: node.kind,
    description: liveNodeDetails[`${flow.flow_id}/${node.node_id}`]?.spec.description ?? "",
    agent_id: node.agent,
    inference_id: node.inference,
    calls: CALL_TARGETS[`${flow.flow_id}/${node.node_id}`] ?? null,
  })),
})

const agentOptions = (): readonly S["AgentRefView"][] => {
  const models = new Map(liveExperiments.flatMap((experiment) => experiment.agents.map((agent) => [agent.agent_id, agent.spec.model] as const)))
  return [...models].sort(([left], [right]) => left.localeCompare(right)).map(([agentId, model]) => ({ agent_id: agentId, model }))
}

const authoringOptions = (flow: string | null): S["AuthoringOptionsView"] => ({
  flows: liveFlows.map(flowOption),
  agents: [...agentOptions()],
  datasets: authoringDatasets.filter((seed) => flow === null || seed.flowId === flow).map(datasetOption),
  evaluators: [...AUTHORING_EVALUATORS],
  question_kinds: [...QUESTION_KINDS],
  metrics: [...AUTHORING_METRICS],
})

const knownExperiment = (experimentId: string): ApiExperimentDetail | null =>
  created.find((item) => item.experiment_id === experimentId) ?? liveExperiments.find((item) => item.experiment_id === experimentId) ?? null

const selectionOf = (seed: AuthoringDatasetSeed, tags: Tags): ApiCaseSelection => {
  const count = countOf(seed, tags)
  return { dataset_id: seed.datasetId, flow_id: seed.flowId, tags, selected: count.selected, total: count.total, splits: count.splits }
}

export const authoredCases = (experiment: ApiExperimentDetail): ApiCaseSelection => casesOverrides.get(experiment.experiment_id) ?? experiment.cases

export const createdExperiments = (): readonly ApiExperimentDetail[] => created

const casesDiagnostics = (experiment: ApiExperimentDetail, seed: AuthoringDatasetSeed, tags: Tags) => {
  const file = specPath(experiment.experiment_id)
  const count = countOf(seed, tags)
  const empty = count.selected === 0 ? [{ code: "E_CASES_EMPTY", severity: "error", file, path: ["cases", "tags"], message: `experiment ${experiment.experiment_id}: no case of ${seed.datasetId} has every listed tag`, line: null, column: null, hint: "drop a tag or pick another value" }] : []
  const plan = experiment.plan.cases ?? null
  const short = plan !== null && plan > count.selected ? [{ code: "W_PLAN_EXCEEDS_CASES", severity: "warning", file, path: ["plan", "cases"], message: `plan asks for ${String(plan)} cases, the selection has ${String(count.selected)}`, line: null, column: null, hint: null }] : []
  return [...empty, ...short]
}

const writeCases = (experiment: ApiExperimentDetail, body: Json): Response | Promise<Response> => {
  const cases = isRecord(body["cases"]) ? body["cases"] : {}
  const expects = isRecord(body["expects"]) ? body["expects"] : {}
  const seed = seedOf(textAt(cases, "dataset"))
  if (seed === null) {
    return failure(UNPROCESSABLE, "experiment_cases_write", "REQUEST_INVALID", `dataset ${textAt(cases, "dataset")} does not exist`, [
      { path: ["cases", "dataset"], code: "E_DATASET_UNKNOWN", message: `dataset ${textAt(cases, "dataset")} does not exist in the project` },
    ])
  }
  const file = specPath(experiment.experiment_id)
  if (textAt(expects, "file_hash") !== hashOf(experiment.experiment_id)) {
    return failure(PRECONDITION_FAILED, "experiment_cases_write", "STALE_FILE", `${file} changed after it was read`)
  }
  const tags = tagsAt(cases, "tags")
  casesOverrides = new Map([...casesOverrides, [experiment.experiment_id, selectionOf(seed, tags)]])
  touchExperimentFile(experiment.experiment_id)
  return served({ file, file_hash: hashOf(experiment.experiment_id), diagnostics: casesDiagnostics(experiment, seed, tags) })
}

const specProblems = (experimentId: string, spec: Json): readonly Problem[] => [
  ...(NAME.test(experimentId) ? [] : [{ path: ["body", "experiment_id"], code: "value_error", message: "the id is snake_case: lowercase letters, digits and _" }]),
  ...(textAt(spec, "description").length > 0 ? [] : [{ path: ["body", "spec", "description"], code: "string_too_short", message: "the description says the question in words" }]),
  ...(isRecord(spec["subject"]) ? [] : [{ path: ["body", "spec", "subject"], code: "missing", message: "the subject names a flow" }]),
  ...(isRecord(spec["cases"]) && seedOf(textAt(spec["cases"], "dataset")) !== null ? [] : [{ path: ["body", "spec", "cases", "dataset"], code: "missing", message: "the cases name a dataset of the project" }]),
  ...(Array.isArray(spec["variants"]) && spec["variants"].length > 0 ? [] : [{ path: ["body", "spec", "variants"], code: "too_short", message: "an experiment has at least one variant" }]),
  ...(isRecord(spec["question"]) ? [] : [{ path: ["body", "spec", "question"], code: "missing", message: "the question has a kind" }]),
]

const TEMPLATE_EXPERIMENT = "reply_look"

const createdDetail = (experimentId: string, spec: Json): ApiExperimentDetail => {
  const base = liveExperiments.find((item) => item.experiment_id === TEMPLATE_EXPERIMENT)
  if (base === undefined) throw new Error(`mock experiment ${TEMPLATE_EXPERIMENT} is missing`)
  const cases = isRecord(spec["cases"]) ? spec["cases"] : {}
  const seed = seedOf(textAt(cases, "dataset"))
  return {
    ...base,
    experiment_id: experimentId,
    description: textAt(spec, "description"),
    cases: seed === null ? base.cases : selectionOf(seed, tagsAt(cases, "tags")),
    files: { spec: specPath(experimentId), notes: null },
    created: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    activity_source: "files",
  }
}

const createExperiment = (body: Json): Response | Promise<Response> => {
  const experimentId = textAt(body, "experiment_id")
  const spec = isRecord(body["spec"]) ? body["spec"] : {}
  const problems = specProblems(experimentId, spec)
  if (problems.length > 0) return failure(UNPROCESSABLE, "experiment_create", "REQUEST_INVALID", "the experiment does not validate", problems)
  if (knownExperiment(experimentId) !== null) return failure(PRECONDITION_FAILED, "experiment_create", "FILE_EXISTS", `experiment ${experimentId} already exists in experiments/${experimentId}`)
  created = [...created, createdDetail(experimentId, spec)]
  return served({ experiment_id: experimentId, file: specPath(experimentId), file_hash: hashOf(experimentId), diagnostics: [] }, CREATED)
}

const experimentOfPath = (path: string): string | null => {
  const match = /^experiments\/([^/]+)\/experiment\.yaml$/.exec(path)
  return match?.[1] ?? null
}

const fileDetail = (path: string, experimentId: string) => ({
  path,
  kind: "Experiment",
  file_hash: hashOf(experimentId),
  size_bytes: 0,
  mtime_ns: 0,
  parse_status: "ok",
  sync_state: "synced",
  problems_count: 0,
  last_good_content_hash: null,
  problems: [],
})

export const authoringHandlers = [
  http.get(`${API_BASE}/research/authoring`, ({ request }) => served(authoringOptions(new URL(request.url).searchParams.get("flow")))),

  http.post(`${API_BASE}/research/authoring/count`, async ({ request }) => {
    const body: unknown = await request.json()
    const query = isRecord(body) ? body : {}
    const seed = seedOf(textAt(query, "dataset_id"))
    if (seed === null) return failure(NOT_FOUND, "authoring_count", "NOT_FOUND", `dataset ${textAt(query, "dataset_id")} not found`)
    return served(countOf(seed, tagsAt(query, "tags")))
  }),

  http.put(`${API_BASE}/experiments/:experimentId/cases`, async ({ params, request }) => {
    const experimentId = typeof params["experimentId"] === "string" ? params["experimentId"] : ""
    const experiment = knownExperiment(experimentId)
    if (experiment === null) return failure(NOT_FOUND, "experiment_cases_write", "NOT_FOUND", `experiment ${experimentId} not found`)
    const body: unknown = await request.json()
    return writeCases(experiment, isRecord(body) ? body : {})
  }),

  http.post(`${API_BASE}/experiments`, async ({ request }) => {
    const body: unknown = await request.json()
    return createExperiment(isRecord(body) ? body : {})
  }),

  http.get(`${FILES_PREFIX}*`, ({ request }) => {
    const path = decodeURIComponent(new URL(request.url).pathname.slice(FILES_PREFIX.length))
    const experimentId = experimentOfPath(path)
    if (experimentId === null || knownExperiment(experimentId) === null) return failure(NOT_FOUND, "file_get", "NOT_FOUND", `file ${path} is not in the project`)
    return served(fileDetail(path, experimentId))
  }),
]
