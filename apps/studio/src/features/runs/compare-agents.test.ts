import { describe, expect, it } from "vitest"
import type { ApiNode } from "@/domain"
import { compareAgentsPrompt, stepAgents } from "./compare-agents"
import { execution, topAddress } from "./test-support"

const node = (nodeId: string, kind: ApiNode["kind"], agent: string | null): ApiNode => ({
  node_id: nodeId,
  local_id: nodeId.split("__").at(-1) ?? nodeId,
  parent: nodeId.includes("__") ? nodeId.split("__")[0] ?? null : null,
  kind,
  path: `flows/support_case/nodes/${nodeId}.node.yaml`,
  file_hash: "sha256-1",
  agent,
  inference: null,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: [],
  downstream: [],
})

const NODES: readonly ApiNode[] = [
  node("polish", "loop", null),
  node("polish__critique", "llm", "mistral"),
  node("polish__revise", "llm", "gpt"),
  node("polish_summary", "llm", "gemini"),
  node("finalize", "code", null),
]

describe("stepAgents", () => {
  it("lists the LLM nodes of the step with their agents and the models they ran on", () => {
    const executions = [
      execution("polish__revise", { address: { ...topAddress("polish__revise"), iteration: 0 }, model: "openai/gpt-5" }),
      execution("polish__revise", { address: { ...topAddress("polish__revise"), iteration: 1 }, model: "openai/gpt-5" }),
    ]
    expect(stepAgents("polish", NODES, executions)).toEqual([
      { nodeId: "polish__critique", agent: "mistral", models: [] },
      { nodeId: "polish__revise", agent: "gpt", models: ["openai/gpt-5"] },
    ])
  })

  it("finds nothing to compare on a code step", () => {
    expect(stepAgents("finalize", NODES, [])).toEqual([])
  })
})

describe("compareAgentsPrompt", () => {
  it("asks for an experiment on the step with the current agents as the baseline", () => {
    const prompt = compareAgentsPrompt({
      flowId: "support_case",
      step: "polish",
      runId: "run-1",
      item: { datasetId: "support_case_cases", caseName: "strip" },
      agents: [{ nodeId: "polish__revise", agent: "gpt", models: ["openai/gpt-5"] }],
    })
    expect(prompt).toContain("compares agents on the step polish of flow support_case")
    expect(prompt).toContain("- polish__revise uses agent gpt (model openai/gpt-5)")
    expect(prompt).toContain("from polish to polish")
    expect(prompt).toContain("dataset support_case_cases")
    expect(prompt).toContain("experiments/<experiment_id>/experiment.yaml")
  })
})
