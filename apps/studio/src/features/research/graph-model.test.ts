import { describe, expect, it } from "vitest"
import type { ApiNode, ApiPromptDetail, ExperimentDetail, ExperimentVariant } from "@/domain"
import * as ids from "@/data/ids"
import { buildGraph, withFieldCounts } from "@/features/flow"
import { graphViews, markSwaps, nodeAgents, nodeFacts, outsideRange, selectedFacts, swapText, type SubjectGraph } from "./graph-model"

const node = (id: string, parent: string | null = null, agent: string | null = null, inference: string | null = null): ApiNode => ({
  node_id: id,
  local_id: id,
  parent,
  kind: "llm",
  path: `nodes/${id}.node.yaml`,
  file_hash: "",
  agent,
  inference,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: [],
  downstream: [],
})

const fields = (...names: readonly string[]) => ({ type: "object", properties: Object.fromEntries(names.map((name) => [name, { type: "string" }])) })

const FLOW: SubjectGraph = {
  key: "support_case",
  arm: null,
  nodes: [node("triage"), node("polish"), node("polish__revise", "polish", "gpt", "revise"), node("send")],
  order: ["triage", "polish", "send"],
  schemas: { triage: { in: fields("message", "channel"), out: fields("summary") }, send: { in: null, out: null } },
  prompts: { kind: "flow", flow: ids.flowId("support_case") },
}

const PROMPT: ApiPromptDetail = {
  flow_id: "one_step",
  node_id: "classify",
  inference_id: "classify",
  level: 1,
  path: "experiments/split/arms/one_step/nodes/classify/classify.prompt.md",
  file_hash: null,
  builder_ref: null,
  has_draft: false,
  draft_stale: false,
  problems_count: 0,
  source: { text: "Decide the intent.", file_hash: null },
  analysis: null,
  slots: [],
  unused_inputs: [],
  variant_files: [],
  problems: [],
}

const ARM: SubjectGraph = {
  key: "one_step",
  arm: ids.armId("one_step"),
  nodes: [node("classify", null, "gemini", "classify"), node("pick")],
  order: ["classify", "pick"],
  schemas: {},
  prompts: { kind: "arm", prompts: { classify: PROMPT } },
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

describe("steps on the canvas", () => {
  it("counts the declared input and output fields of a step and keeps the edge count without a schema", () => {
    const graph = withFieldCounts(buildGraph(FLOW.nodes, FLOW.order), FLOW.schemas)
    const counts = graph.nodes.flatMap((item) => (item.role === "step" ? [[item.id, item.inputs, item.outputs]] : []))
    expect(counts).toEqual([
      ["triage", 2, 1],
      ["polish__revise", 0, 0],
      ["send", 0, 0],
    ])
  })
})

describe("the selected step", () => {
  it("fetches the prompt of an llm step in a flow and takes an arm prompt from the arm", () => {
    const [flow, arm] = graphViews(experiment({}), [FLOW, ARM])
    if (flow === undefined || arm === undefined) throw new Error("no views")
    expect(nodeFacts(experiment({}), flow, "polish__revise")?.prompt).toEqual({ kind: "remote", flow: "support_case", node: "polish__revise" })
    expect(nodeFacts(experiment({}), flow, "triage")?.prompt).toEqual({ kind: "none" })
    expect(nodeFacts(experiment({}), arm, "classify")?.prompt).toEqual({ kind: "ready", prompt: PROMPT })
    expect(nodeFacts(experiment({}), flow, "triage")?.schemas).toEqual({ in: fields("message", "channel"), out: fields("summary") })
  })

  it("reads the description of a flow step from the flow and of an arm step from the arm", () => {
    const withArm = experiment({ arms: [{ id: ids.armId("one_step"), description: "", steps: [{ node: ids.nodeId("classify"), kind: "llm", agent: null, description: "Decides the intent" }] }] })
    const [flow, arm] = graphViews(withArm, [FLOW, ARM])
    if (flow === undefined || arm === undefined) throw new Error("no views")
    expect(nodeFacts(withArm, flow, "polish__revise")?.description).toEqual({ kind: "remote", flow: "support_case", node: "polish__revise" })
    expect(nodeFacts(withArm, arm, "classify")?.description).toEqual({ kind: "ready", text: "Decides the intent" })
    expect(nodeFacts(withArm, arm, "pick")?.description).toEqual({ kind: "ready", text: null })
  })

  it("finds the facts of the selected graph and step only", () => {
    const views = graphViews(experiment({}), [FLOW, ARM])
    expect(selectedFacts(experiment({}), views, { graph: "one_step", node: "classify" })?.id).toBe("classify")
    expect(selectedFacts(experiment({}), views, { graph: "one_step", node: "triage" })).toBeNull()
    expect(selectedFacts(experiment({}), views, null)).toBeNull()
  })
})
