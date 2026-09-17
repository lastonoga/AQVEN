import { delay, http, HttpResponse, type PathParams } from "msw"
import type { ChatSource, NodeSource, ReviewSource, RunSource, SchemaSource, TestSource, WorkspaceSource } from "@/data/ports"
import { API_BASE } from "@/data/http/client"
import { callDetails } from "./data/calls"
import { chatThreads } from "./data/chat"
import { dataflowRuns } from "./data/dataflow"
import { resourceKey } from "./data/keys"
import { contracts, nodesOverviews } from "./data/nodes"
import { reviewDetails, reviewQueues } from "./data/review"
import { runLists } from "./data/run-list"
import { inspections, schemaGraphs } from "./data/schema"
import { MOCK_SCENARIO_KEY, scenarioOverview, workflowTemplates } from "./data/setup"
import { testDetails, rowTraces } from "./data/test-detail"
import { testsOverviews } from "./data/tests"
import { shells } from "./data/workspace"

type PortRead = (...args: never[]) => Promise<unknown>
type Served<F extends PortRead> = NonNullable<Awaited<ReturnType<F>>>
type Table<T> = Readonly<Record<string, T>>

export type ReadTables = {
  readonly "/shell": Table<Served<WorkspaceSource["shell"]>>
  readonly "/schema": Table<Served<SchemaSource["graph"]>>
  readonly "/schema/nodes/:nodeId": Table<Served<SchemaSource["inspect"]>>
  readonly "/runs": Table<Served<RunSource["list"]>>
  readonly "/runs/:runId/dataflow": Table<Served<RunSource["dataflow"]>>
  readonly "/calls/:callId": Table<Served<RunSource["call"]>>
  readonly "/nodes": Table<Served<NodeSource["overview"]>>
  readonly "/nodes/:nodeId/contract": Table<Served<NodeSource["contract"]>>
  readonly "/tests": Table<Served<TestSource["overview"]>>
  readonly "/tests/:testId": Table<Served<TestSource["detail"]>>
  readonly "/tests/:testId/rows/:rowId/trace": Table<Served<TestSource["trace"]>>
  readonly "/reviews": Table<Served<ReviewSource["queue"]>>
  readonly "/reviews/:reviewId": Table<Served<ReviewSource["detail"]>>
  readonly "/chat/thread": Table<Served<ChatSource["thread"]>>
}

type ReadTable = ReadTables[keyof ReadTables]

const LATENCY_MS = 120
const NO_CONTENT = 204
const NOT_FOUND = 404
const SCOPE = `${API_BASE}/workspaces/:workspaceId/workflows/:workflowId`
const PARAM_NAME = /:(\w+)/g

export const READS = {
  "/shell": shells,
  "/schema": schemaGraphs,
  "/schema/nodes/:nodeId": inspections,
  "/runs": runLists,
  "/runs/:runId/dataflow": dataflowRuns,
  "/calls/:callId": callDetails,
  "/nodes": nodesOverviews,
  "/nodes/:nodeId/contract": contracts,
  "/tests": testsOverviews,
  "/tests/:testId": testDetails,
  "/tests/:testId/rows/:rowId/trace": rowTraces,
  "/reviews": reviewQueues,
  "/reviews/:reviewId": reviewDetails,
  "/chat/thread": chatThreads,
} as const satisfies ReadTables

const paramNames = (path: string): readonly string[] => Array.from(path.matchAll(PARAM_NAME), (match) => match[1] ?? "")

const paramText = (params: PathParams, name: string): string => {
  const value = params[name]
  return typeof value === "string" ? value : ""
}

const keyOf = (path: string, params: PathParams): string =>
  resourceKey(...paramNames(path).map((name) => paramText(params, name)))

const notFound = (): Response => HttpResponse.json({ error: "not_found" }, { status: NOT_FOUND })

const read = ([path, table]: readonly [string, ReadTable]) => {
  const fullPath = `${SCOPE}${path}`
  return http.get(fullPath, async ({ params }) => {
    await delay(LATENCY_MS)
    const body = table[keyOf(fullPath, params)]
    if (body === undefined) return notFound()
    return HttpResponse.json(body)
  })
}

const DECISION_PATH = `${SCOPE}/reviews/:reviewId/decision`

const decide = http.post(DECISION_PATH, async ({ params }) => {
  await delay(LATENCY_MS)
  if (reviewDetails[keyOf(DECISION_PATH, params)] === undefined) return notFound()
  return new HttpResponse(null, { status: NO_CONTENT })
})

const mockScenario = (): string | null => globalThis.localStorage.getItem(MOCK_SCENARIO_KEY)

const setup = http.get(`${API_BASE}/setup`, async () => {
  await delay(LATENCY_MS)
  return HttpResponse.json(scenarioOverview(mockScenario()))
})

const templates = http.get(`${API_BASE}/templates`, async () => {
  await delay(LATENCY_MS)
  return HttpResponse.json(workflowTemplates)
})

export const handlers = [...Object.entries(READS).map(read), decide, setup, templates]
