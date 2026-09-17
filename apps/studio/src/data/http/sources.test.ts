import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { callId, nodeId, reviewId, rowId, runId, testId, workflowId, workspaceId } from "@/data/ids"
import { callDetails } from "@/mocks/data/calls"
import { chatThreads } from "@/mocks/data/chat"
import { dataflowRuns } from "@/mocks/data/dataflow"
import { WORKFLOWS, WORKSPACE, resourceKey, workflowKey } from "@/mocks/data/keys"
import { contracts, nodesOverviews } from "@/mocks/data/nodes"
import { reviewDetails, reviewQueues } from "@/mocks/data/review"
import { runLists } from "@/mocks/data/run-list"
import { inspections, schemaGraphs } from "@/mocks/data/schema"
import { setupOverview, workflowTemplates } from "@/mocks/data/setup"
import { rowTraces, testDetails } from "@/mocks/data/test-detail"
import { testsOverviews } from "@/mocks/data/tests"
import { shells } from "@/mocks/data/workspace"
import { server } from "@/mocks/node"
import type { WorkflowScope } from "../ports"
import { HttpError } from "./client"
import { httpSources } from "./sources"

type PortCase = {
  readonly port: string
  readonly request: string
  readonly call: () => Promise<unknown>
  readonly expected: unknown
}

const scope: WorkflowScope = { workspaceId: WORKSPACE, workflowId: WORKFLOWS.pitchPipeline }
const unknownScope: WorkflowScope = { workspaceId: workspaceId("hotel_pitch"), workflowId: workflowId("missing") }
const base = "GET /api/v1/workspaces/hotel_pitch/workflows/pitch_pipeline"
const key = workflowKey(WORKFLOWS.pitchPipeline)

const CASES: readonly PortCase[] = [
  { port: "workspace.shell", request: `${base}/shell`, call: () => httpSources.workspace.shell(scope), expected: shells[key] },
  { port: "schema.graph", request: `${base}/schema`, call: () => httpSources.schema.graph(scope), expected: schemaGraphs[key] },
  {
    port: "schema.inspect",
    request: `${base}/schema/nodes/pitch_gen_b`,
    call: () => httpSources.schema.inspect(scope, nodeId("pitch_gen_b")),
    expected: inspections[resourceKey(key, "pitch_gen_b")],
  },
  { port: "runs.list", request: `${base}/runs`, call: () => httpSources.runs.list(scope), expected: runLists[key] },
  {
    port: "runs.dataflow",
    request: `${base}/runs/8247/dataflow`,
    call: () => httpSources.runs.dataflow(scope, runId("8247")),
    expected: dataflowRuns[resourceKey(key, "8247")],
  },
  {
    port: "runs.call",
    request: `${base}/calls/call_01HT9`,
    call: () => httpSources.runs.call(scope, callId("call_01HT9")),
    expected: callDetails[resourceKey(key, "call_01HT9")],
  },
  { port: "nodes.overview", request: `${base}/nodes`, call: () => httpSources.nodes.overview(scope), expected: nodesOverviews[key] },
  {
    port: "nodes.contract",
    request: `${base}/nodes/pitch_gen_b/contract`,
    call: () => httpSources.nodes.contract(scope, nodeId("pitch_gen_b")),
    expected: contracts[resourceKey(key, "pitch_gen_b")],
  },
  { port: "tests.overview", request: `${base}/tests`, call: () => httpSources.tests.overview(scope), expected: testsOverviews[key] },
  {
    port: "tests.detail",
    request: `${base}/tests/pitch_gen_b`,
    call: () => httpSources.tests.detail(scope, testId("pitch_gen_b")),
    expected: testDetails[resourceKey(key, "pitch_gen_b")],
  },
  {
    port: "tests.trace",
    request: `${base}/tests/pitch_gen_b/rows/07/trace`,
    call: () => httpSources.tests.trace(scope, testId("pitch_gen_b"), rowId("07")),
    expected: rowTraces[resourceKey(key, "pitch_gen_b", "07")],
  },
  { port: "review.queue", request: `${base}/reviews`, call: () => httpSources.review.queue(scope), expected: reviewQueues[key] },
  {
    port: "review.detail",
    request: `${base}/reviews/review_8247_decide_pitch`,
    call: () => httpSources.review.detail(scope, reviewId("review_8247_decide_pitch")),
    expected: reviewDetails[resourceKey(key, "review_8247_decide_pitch")],
  },
  {
    port: "review.decide",
    request: `POST /api/v1/workspaces/hotel_pitch/workflows/pitch_pipeline/reviews/review_8247_decide_pitch/decision`,
    call: () => httpSources.review.decide(scope, { reviewId: reviewId("review_8247_decide_pitch"), decision: "approve", note: "ok" }),
    expected: undefined,
  },
  { port: "chat.thread", request: `${base}/chat/thread`, call: () => httpSources.chat.thread(scope), expected: chatThreads[key] },
  { port: "setup.overview", request: "GET /api/v1/setup", call: () => httpSources.setup.overview(), expected: setupOverview },
  { port: "setup.templates", request: "GET /api/v1/templates", call: () => httpSources.setup.templates(), expected: workflowTemplates },
]

const MISSING: readonly { readonly port: string; readonly call: () => Promise<unknown> }[] = [
  { port: "workspace.shell", call: () => httpSources.workspace.shell(unknownScope) },
  { port: "schema.inspect", call: () => httpSources.schema.inspect(scope, nodeId("missing")) },
  { port: "runs.dataflow", call: () => httpSources.runs.dataflow(scope, runId("1")) },
  { port: "runs.call", call: () => httpSources.runs.call(scope, callId("missing")) },
  { port: "nodes.contract", call: () => httpSources.nodes.contract(scope, nodeId("missing")) },
  { port: "tests.detail", call: () => httpSources.tests.detail(scope, testId("missing")) },
  { port: "tests.trace", call: () => httpSources.tests.trace(scope, testId("pitch_gen_b"), rowId("99")) },
  { port: "review.detail", call: () => httpSources.review.detail(scope, reviewId("missing")) },
]

describe("httpSources", () => {
  const requests: string[] = []
  const record = ({ request }: { readonly request: Request }) => {
    requests.push(`${request.method} ${new URL(request.url).pathname}`)
  }

  beforeEach(() => {
    requests.length = 0
    server.events.on("request:start", record)
  })

  afterEach(() => {
    server.events.removeListener("request:start", record)
  })

  it.each(CASES)("$port hits its endpoint and returns the mock data", async ({ request, call, expected }) => {
    await expect(call()).resolves.toEqual(expected)
    expect(requests).toEqual([request])
  })

  it("covers every port method", () => {
    const methods = Object.entries(httpSources).flatMap(([port, source]) => Object.keys(source).map((method) => `${port}.${method}`))
    expect(CASES.map((portCase) => portCase.port).sort()).toEqual(methods.sort())
  })

  it.each(MISSING)("$port maps an unknown id to null", async ({ call }) => {
    await expect(call()).resolves.toBeNull()
  })

  it("rejects collection reads of an unknown workflow with HttpError 404", async () => {
    const failure = httpSources.schema.graph(unknownScope)
    await expect(failure).rejects.toBeInstanceOf(HttpError)
    await expect(failure).rejects.toMatchObject({ status: 404, path: "/workspaces/hotel_pitch/workflows/missing/schema" })
  })

  it("rejects a decision on an unknown review", async () => {
    await expect(httpSources.review.decide(scope, { reviewId: reviewId("missing"), decision: "reject", note: "" })).rejects.toMatchObject({
      status: 404,
    })
  })
})
