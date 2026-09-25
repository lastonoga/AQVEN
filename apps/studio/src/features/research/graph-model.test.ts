import { describe, expect, it } from "vitest"
import type { ApiNode, ApiPromptDetail, ExperimentDetail, ExperimentVariant, FactorChange } from "@/domain"
import * as ids from "@/data/ids"
import { buildGraph, withFieldCounts } from "@/features/flow"
import { graphViews, markSteps, nodeAgents, nodeFacts, outsideRange, selectedFacts, swapText, type StepMark, type SubjectGraph } from "./graph-model"

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
  flow: ids.flowId("support_case"),
  local: false,
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
  path: "experiments/split/flows/one_step/nodes/classify/classify.prompt.md",
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

const LOCAL: SubjectGraph = {
  key: "one_step",
  flow: ids.flowId("one_step"),
  local: true,
  nodes: [node("classify", null, "gemini", "classify"), node("pick")],
  order: ["classify", "pick"],
  schemas: {},
  prompts: { kind: "local", prompts: { classify: PROMPT } },
}

const variant = (id: string, agent: string, changes: readonly FactorChange[] = []): ExperimentVariant => ({
  id: ids.variantId(id),
  role: "other",
  changes,
  assignments: [{ node: ids.nodeId("polish__revise"), agent: { id: ids.agentId(agent), model: `openrouter:${agent}` }, overridden: false }],
})

type Experiment = Pick<ExperimentDetail, "subject" | "varies" | "flows" | "variants">

const experiment = (fields: Partial<Experiment>): Experiment => ({
  subject: { kind: "range", flow: ids.flowId("support_case"), local: false, range: { from: ids.nodeId("polish"), to: ids.nodeId("polish") } },
  varies: { what: "agent", nodes: [ids.nodeId("revise")] },
  flows: [],
  variants: [variant("gpt", "gpt"), variant("mistral", "mistral", [{ node: ids.nodeId("revise"), what: "agent", value: "mistral" }])],
  ...fields,
})

const markLabel = (mark: StepMark): string => (mark.kind === "swap" ? `swap: ${mark.agents}` : `${mark.what}: ${mark.values.join(" · ")}`)

const metaOf = (graph: ReturnType<typeof buildGraph>, id: string): string | null => {
  const found = graph.nodes.find((item) => item.id === id)
  return found?.role === "step" ? found.meta : null
}

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
    expect([...view.marks]).toEqual([["polish__revise", { kind: "swap", agents: "gpt → mistral" }]])
    expect([...view.dimmed]).toEqual(["triage", "send"])
    expect(view.role).toBe("subject")
    expect(metaOf(markSteps(buildGraph(FLOW.nodes, FLOW.order), view.marks, markLabel), "polish__revise")).toBe("swap: gpt → mistral")
  })

  it("marks a factor node with the values the variants give it when the agents stay", () => {
    const prompts = experiment({
      varies: { what: "prompt", nodes: [ids.nodeId("revise")] },
      variants: [variant("as_written", "gpt"), variant("terse", "gpt", [{ node: ids.nodeId("revise"), what: "prompt", value: "terse" }])],
    })
    const [view] = graphViews(prompts, [FLOW])
    expect(view === undefined ? [] : [...view.marks]).toEqual([["polish__revise", { kind: "factor", what: "prompt", values: ["terse"] }]])
  })

  it("puts every variant on the subject and a called flow only under the variants that call it", () => {
    const subject: SubjectGraph = { ...LOCAL, key: "intent_decision", flow: ids.flowId("intent_decision") }
    const pair: SubjectGraph = { ...LOCAL, key: "pair", flow: ids.flowId("pair") }
    const views = graphViews(
      experiment({
        subject: { kind: "flow", flow: ids.flowId("intent_decision"), local: true },
        varies: { what: "flow", nodes: [ids.nodeId("ballots")] },
        variants: [variant("single", "llama"), variant("pair", "llama", [{ node: ids.nodeId("ballots"), what: "flow", value: "pair" }])],
      }),
      [subject, pair],
    )
    expect(views.map((view) => [view.role, view.variants.map((item) => item.id)])).toEqual([
      ["subject", ["single", "pair"]],
      ["called", ["pair"]],
    ])
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
  it("fetches the prompt of an llm step in a flow and takes the prompt of a flow of the experiment from it", () => {
    const [flow, local] = graphViews(experiment({}), [FLOW, LOCAL])
    if (flow === undefined || local === undefined) throw new Error("no views")
    expect(nodeFacts(experiment({}), flow, "polish__revise")?.prompt).toEqual({ kind: "remote", flow: "support_case", node: "polish__revise" })
    expect(nodeFacts(experiment({}), flow, "triage")?.prompt).toEqual({ kind: "none" })
    expect(nodeFacts(experiment({}), local, "classify")?.prompt).toEqual({ kind: "ready", prompt: PROMPT })
    expect(nodeFacts(experiment({}), flow, "triage")?.schemas).toEqual({ in: fields("message", "channel"), out: fields("summary") })
  })

  it("reads the description of a flow step from the flow and of a step of an experiment flow from the experiment", () => {
    const withLocal = experiment({ flows: [{ id: ids.flowId("one_step"), description: "", file: null, steps: [{ node: ids.nodeId("classify"), kind: "llm", agent: null, description: "Decides the intent" }] }] })
    const [flow, local] = graphViews(withLocal, [FLOW, LOCAL])
    if (flow === undefined || local === undefined) throw new Error("no views")
    expect(nodeFacts(withLocal, flow, "polish__revise")?.description).toEqual({ kind: "remote", flow: "support_case", node: "polish__revise" })
    expect(nodeFacts(withLocal, local, "classify")?.description).toEqual({ kind: "ready", text: "Decides the intent" })
    expect(nodeFacts(withLocal, local, "pick")?.description).toEqual({ kind: "ready", text: null })
  })

  it("finds the facts of the selected graph and step only", () => {
    const views = graphViews(experiment({}), [FLOW, LOCAL])
    expect(selectedFacts(experiment({}), views, { graph: "one_step", node: "classify" })?.id).toBe("classify")
    expect(selectedFacts(experiment({}), views, { graph: "one_step", node: "triage" })).toBeNull()
    expect(selectedFacts(experiment({}), views, null)).toBeNull()
  })
})
