import { describe, expect, it } from "vitest"
import type { ApiNode, ExperimentDetail, ExperimentVariant } from "@/domain"
import * as ids from "@/data/ids"
import { buildGraph } from "@/features/flow"
import { graphViews, markSwaps, nodeAgents, outsideRange, swapText, type SubjectGraph } from "./graph-model"

const node = (id: string, parent: string | null = null, agent: string | null = null): ApiNode => ({
  node_id: id,
  local_id: id,
  parent,
  kind: "llm",
  path: `nodes/${id}.node.yaml`,
  file_hash: "",
  agent,
  inference: null,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: [],
  downstream: [],
})

const FLOW: SubjectGraph = {
  key: "support_case",
  arm: null,
  nodes: [node("triage"), node("polish"), node("polish__revise", "polish", "gpt"), node("send")],
  order: ["triage", "polish", "send"],
}

const variant = (id: string, agent: string, arm: string | null = null): ExperimentVariant => ({
  id: ids.variantId(id),
  arm: arm === null ? null : ids.armId(arm),
  role: "other",
  assignments: [{ node: ids.nodeId("polish__revise"), agent: { id: ids.agentId(agent), model: `openrouter:${agent}` }, overridden: false }],
})

const experiment = (fields: Partial<Pick<ExperimentDetail, "subject" | "arms" | "variants">>): Pick<ExperimentDetail, "subject" | "arms" | "variants"> => ({
  subject: { kind: "range", flow: ids.flowId("support_case"), range: { from: ids.nodeId("polish"), to: ids.nodeId("polish") } },
  arms: [],
  variants: [variant("gpt", "gpt"), variant("mistral", "mistral")],
  ...fields,
})

describe("the tested range", () => {
  it("fades every node whose top-level step is outside the range", () => {
    expect([...outsideRange(FLOW, { from: ids.nodeId("polish"), to: ids.nodeId("polish") })]).toEqual(["triage", "send"])
    expect([...outsideRange(FLOW, { from: ids.nodeId("polish__revise"), to: ids.nodeId("send") })]).toEqual(["triage"])
  })

  it("fades nothing without a range or with a range it cannot place", () => {
    expect(outsideRange(FLOW, null).size).toBe(0)
    expect(outsideRange(FLOW, { from: ids.nodeId("gone"), to: ids.nodeId("send") }).size).toBe(0)
  })
})

describe("agent swaps", () => {
  it("names the agents a node gets across the variants", () => {
    const [gpt, mistral] = experiment({}).variants
    if (gpt === undefined || mistral === undefined) throw new Error("no variants")
    expect(swapText(nodeAgents([gpt, mistral], "polish__revise", { agent: null, model: null }))).toBe("gpt → mistral")
    expect(swapText(nodeAgents([gpt, gpt], "polish__revise", { agent: null, model: null }))).toBeNull()
    expect(swapText(nodeAgents([gpt, mistral, variant("llama", "llama")], "polish__revise", { agent: null, model: null }))).toBe("gpt · mistral · llama")
  })

  it("falls back to the node's own agent where a variant assigns none", () => {
    expect(nodeAgents([variant("gpt", "gpt")], "triage", { agent: "gemini", model: null })).toEqual([{ variant: "gpt", agent: "gemini", model: null, overridden: false }])
  })

  it("marks the swapped step on the graph and dims the rest of the flow", () => {
    const [view] = graphViews(experiment({}), [FLOW])
    if (view === undefined) throw new Error("no view")
    expect([...view.swaps]).toEqual([["polish__revise", "gpt → mistral"]])
    expect([...view.dimmed]).toEqual(["triage", "send"])
    const marked = markSwaps(buildGraph(FLOW.nodes, FLOW.order), view.swaps, (agents) => `swap: ${agents}`)
    const revise = marked.nodes.find((item) => item.id === "polish__revise")
    expect(revise?.role === "step" ? revise.meta : null).toBe("swap: gpt → mistral")
  })

  it("puts a variant without an arm on the subject arm", () => {
    const arm: SubjectGraph = { ...FLOW, key: "critic", arm: ids.armId("critic") }
    const other: SubjectGraph = { ...FLOW, key: "pair", arm: ids.armId("pair") }
    const views = graphViews(
      experiment({ subject: { kind: "arm", arm: ids.armId("critic"), range: null }, variants: [variant("deepseek", "deepseek"), variant("pair", "llama", "pair")] }),
      [arm, other],
    )
    expect(views.map((view) => view.variants.map((item) => item.id))).toEqual([["deepseek"], ["pair"]])
  })
})
