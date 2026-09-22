import { describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { API_BASE } from "@/api/client"
import { liveSources } from "@/data/live/sources"
import { chatSessionId, flowId, nodeId, runId } from "@/data/ids"
import { server } from "@/mocks/node"
import { COMPLETED_RUN_ID } from "./data/runs"

describe("mock engine coherence", () => {
  it("resolves every listed flow through detail and nodes", async () => {
    const flows = await liveSources.project.flows()
    expect(flows.length).toBeGreaterThan(0)
    for (const flow of flows) {
      const id = flowId(flow.flow_id)
      await expect(liveSources.flow.detail(id)).resolves.toMatchObject({ flow_id: flow.flow_id })
      await expect(liveSources.flow.nodes(id)).resolves.toBeDefined()
    }
  })

  it("references only existing node ids from upstream and downstream", async () => {
    const nodes = await liveSources.flow.nodes(flowId("support_case"))
    const known = new Set(nodes.map((node) => node.node_id))
    const linked = nodes.flatMap((node) => [...node.upstream, ...node.downstream])
    expect(linked.filter((id) => !known.has(id))).toEqual([])
  })

  it("filters runs by flow on the server side", async () => {
    const runs = await liveSources.run.list({ flowId: flowId("support_case") })
    expect(runs.length).toBeGreaterThan(0)
    expect(runs.every((run) => run.flow_id === "support_case")).toBe(true)
    await expect(liveSources.run.list({ flowId: flowId("judge_panel") })).resolves.toEqual([])
  })

  it("serves a snapshot and the same executions for a known run", async () => {
    const runs = await liveSources.run.list({})
    expect(runs.some((run) => run.run_id === COMPLETED_RUN_ID)).toBe(true)
    const id = runId(COMPLETED_RUN_ID)
    const snapshot = await liveSources.run.snapshot(id)
    await expect(liveSources.run.executions(id)).resolves.toEqual(snapshot.executions)
  })

  it("serves the captured human wait detail", async () => {
    const detail = await liveSources.run.execution(
      runId(COMPLETED_RUN_ID),
      { node_id: "route__resolve", branch_key: "defect", iteration: null, item_index: null },
      "full",
    )
    expect(detail.human?.wait_kind).toBe("tool_approval")
    expect(detail.human?.assignee).toBe("support_lead")
  })

  it("offers complete flow cases and resolves their run context", async () => {
    const datasets = await liveSources.evals.datasets()
    const dataset = datasets.find((item) => item.dataset_id === "support_case_cases")
    expect(dataset?.flow_id).toBe("support_case")
    const cases = await liveSources.evals.datasetCases("support_case_cases")
    expect(cases).toHaveLength(3)
    const started = await liveSources.run.start({
      flow_id: flowId("support_case"),
      at: "working",
      mode: "live",
      dataset_item_id: `support_case_cases/${cases[0]?.name ?? ""}`,
      selected_nodes: ["triage"],
    })
    expect(started.status).toBe("running")
    const another = await liveSources.run.start({
      flow_id: flowId("support_case"),
      at: "working",
      mode: "live",
      dataset_item_id: `support_case_cases/${cases[1]?.name ?? ""}`,
      selected_nodes: ["triage"],
    })
    expect(another.run_id).not.toBe(started.run_id)
    await expect(liveSources.run.snapshot(runId(another.run_id))).resolves.toMatchObject({
      run_id: another.run_id,
      dataset_item_id: `support_case_cases/${cases[1]?.name ?? ""}`,
      selected_nodes: ["triage"],
    })
  })

  it("previews dependency closure for selected nodes", async () => {
    const scope = await liveSources.flow.runScope(flowId("support_case"), [nodeId("triage")])
    expect(scope.selected_nodes).toEqual(["triage"])
    expect(scope.order).toEqual(["prepare", "triage"])
  })

  it("creates a flow dataset that appears in the catalogue", async () => {
    const draft = await liveSources.evals.draftDataset(flowId("support_case"))
    expect(draft.flow).toBe("support_case")
    const created = await liveSources.evals.createDataset({
      dataset_id: "mock_created_cases",
      flow_id: flowId("support_case"),
      cases: draft.cases,
    })
    expect(created.dataset_id).toBe("mock_created_cases")
    expect((await liveSources.evals.datasetCases("mock_created_cases"))).toHaveLength(1)
  })

  it("generates a demo dataset through the assistant route", async () => {
    const sessions = await liveSources.chat.sessions()
    const session = sessions[0]
    expect(session).toBeDefined()
    await liveSources.chat.send(chatSessionId(session?.session_id ?? ""), {
      text: "Create the project dataset file datasets/mock_generated_cases.yaml for flow support_case.\nGenerate 2 distinct, realistic cases for these scenarios: damaged item",
      client_op_id: crypto.randomUUID(),
    })
    const datasets = await liveSources.evals.datasets()
    expect(datasets.find((item) => item.dataset_id === "mock_generated_cases")?.cases).toBe(2)
  })

  it("loads every page before offering to run a dataset", async () => {
    server.use(http.get(`${API_BASE}/datasets/paged/cases`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor")
      return HttpResponse.json({
        items: [{ name: cursor === null ? "first" : "second", inputs: { message: "sample" } }],
        next_cursor: cursor === null ? "first" : null,
        total_estimate: 2,
      })
    }))
    const cases = await liveSources.evals.datasetCases("paged")
    expect(cases.map((item) => item.name)).toEqual(["first", "second"])
  })
})
