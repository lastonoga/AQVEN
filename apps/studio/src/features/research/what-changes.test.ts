import { describe, expect, it } from "vitest"
import type { ApiNode, ExperimentDetail, ExperimentVariant, FactorAgent, FactorChange, FactorKind, FactorSlot, NodeFile } from "@/domain"
import * as ids from "@/data/ids"
import type { GraphRole, SubjectGraph } from "./graph-model"
import { focusSlot, highlightGraph, initialFocus, NO_FOCUS, openBlock, toggleBlock } from "./page-focus"
import { blockAt, changeBlocks, flowTarget, parseAnchor, slotStep, valueAction, writtenPrompts } from "./what-changes"

type Experiment = Pick<ExperimentDetail, "varies" | "variants" | "slots" | "agents" | "alternatives" | "prompts">

type View = { readonly role: GraphRole; readonly source: SubjectGraph }

const PANEL = "flows/judge_panel/nodes"
const TIE_BREAK_PROMPT = ids.filePath(`${PANEL}/decide/tie_break.prompt.md`)
const CLAIMS_FIRST = ids.filePath("experiments/panel_judge_prompt/prompts/claims_first.md")

const file = (role: NodeFile["role"], path: string): NodeFile => ({ role, path: ids.filePath(path) })

const slot = (node: string, written: string, files: readonly NodeFile[] = []): FactorSlot => ({ node: ids.nodeId(node), kind: "llm", written, files })

const change = (node: string, what: FactorKind, value: string): FactorChange => ({ node: ids.nodeId(node), what, value })

const variant = (id: string, changes: readonly FactorChange[] = []): ExperimentVariant => ({ id: ids.variantId(id), role: "other", changes, assignments: [] })

const JUDGES = ["deepseek", "qwen", "llama"]

const judgeSlot = (node: string): FactorSlot => slot(node, "tie_break", [file("node", `${PANEL}/judges/${node}.node.yaml`), file("prompt", TIE_BREAK_PROMPT)])

const promptExperiment: Experiment = {
  varies: { what: "prompt", nodes: JUDGES.map(ids.nodeId) },
  slots: JUDGES.map(judgeSlot),
  agents: [],
  alternatives: [],
  prompts: [{ name: "claims_first", file: CLAIMS_FIRST }],
  variants: [variant("as_written"), variant("claims_first", JUDGES.map((node) => change(node, "prompt", "claims_first")))],
}

const node = (id: string): ApiNode => ({
  node_id: id,
  local_id: id,
  parent: null,
  kind: "llm",
  path: `${id}.node.yaml`,
  file_hash: "",
  agent: null,
  inference: null,
  prompt_level: null,
  code_ref: null,
  problems_count: 0,
  upstream: [],
  downstream: [],
})

const view = (role: GraphRole, flow: string, nodes: readonly string[]): View => ({
  role,
  source: { key: flow, flow: ids.flowId(flow), local: role !== "subject", nodes: nodes.map(node), order: [], schemas: {}, prompts: { kind: "local", prompts: {} } },
})

const VIEWS: readonly View[] = [view("subject", "judge_panel", ["judges", "judges__qwen", "aggregate"]), view("called", "two_step", ["condense"])]

describe("what changes", () => {
  it("gives each variant one block per value with the prompt it sets and the prompt as written to compare", () => {
    const blocks = changeBlocks(promptExperiment)
    expect(blocks.map((block) => [block.anchor, block.nodes, block.value, block.written])).toEqual([
      ["change-as_written-deepseek", JUDGES, "tie_break", true],
      ["change-claims_first-deepseek", JUDGES, "claims_first", false],
    ])
    expect(blocks[0]?.content).toEqual({ kind: "prompt", file: TIE_BREAK_PROMPT, written: [] })
    expect(blocks[1]?.content).toEqual({ kind: "prompt", file: CLAIMS_FIRST, written: [{ nodes: JUDGES, file: TIE_BREAK_PROMPT }] })
  })

  it("keeps the prompts as written apart when the nodes read different files", () => {
    const experiment = { slots: [judgeSlot("deepseek"), slot("qwen", "short", [file("prompt", "short.prompt.md")]), judgeSlot("llama")] }
    expect(writtenPrompts(experiment, JUDGES.map(ids.nodeId))).toEqual([
      { nodes: ["deepseek", "llama"], file: TIE_BREAK_PROMPT },
      { nodes: ["qwen"], file: "short.prompt.md" },
    ])
  })

  it("shows the files of the alternative or of the node as written under a use factor", () => {
    const nodeFiles = [file("node", `${PANEL}/aggregate/aggregate.node.yaml`), file("code", `${PANEL}/aggregate/aggregate.py`)]
    const altFiles = [file("node", "nodes/majority_only/majority_only.node.yaml"), file("code", "nodes/majority_only/majority_only.py")]
    const blocks = changeBlocks({
      varies: { what: "use", nodes: [ids.nodeId("aggregate")] },
      slots: [slot("aggregate", "aggregate", nodeFiles)],
      agents: [],
      alternatives: [{ id: ids.nodeId("majority_only"), kind: "code", description: "majority alone", file: altFiles[0]?.path ?? ids.filePath(""), files: altFiles }],
      prompts: [],
      variants: [variant("spread"), variant("majority", [change("aggregate", "use", "majority_only")]), variant("missing", [change("aggregate", "use", "gone")])],
    })
    expect(blocks.map((block) => block.content)).toEqual([
      { kind: "use", description: null, files: nodeFiles },
      { kind: "use", description: "majority alone", files: altFiles },
      { kind: "use", description: null, files: [] },
    ])
  })

  it("names the agent of each block and has no blocks for a flow factor", () => {
    const deepseek: FactorAgent = {
      id: ids.agentId("deepseek"),
      file: ids.filePath("agents/deepseek.yaml"),
      spec: { apiVersion: "aqven/v1", kind: "Agent", description: "judge", model: "openrouter:deepseek/deepseek-v4" },
      instructions: null,
    }
    const agents = changeBlocks({ ...promptExperiment, varies: { what: "agent", nodes: [ids.nodeId("tie_break")] }, slots: [slot("tie_break", "gpt")], agents: [deepseek], variants: [variant("gpt"), variant("deepseek", [change("tie_break", "agent", "deepseek")])] })
    expect(agents.map((block) => block.content)).toEqual([{ kind: "agent", agent: null }, { kind: "agent", agent: deepseek }])
    expect(changeBlocks({ ...promptExperiment, varies: { what: "flow", nodes: [ids.nodeId("classify")] } })).toEqual([])
    expect(changeBlocks({ ...promptExperiment, varies: null })).toEqual([])
  })

  it("finds the block of any node it covers and parses the anchors of the page", () => {
    const blocks = changeBlocks(promptExperiment)
    expect(blockAt(blocks, ids.variantId("claims_first"), ids.nodeId("llama"))?.anchor).toBe("change-claims_first-deepseek")
    expect(blockAt(blocks, ids.variantId("claims_first"), ids.nodeId("gather"))).toBeNull()
    expect(parseAnchor("change-claims_first-qwen")).toEqual({ kind: "change", variant: "claims_first", node: "qwen" })
    expect(parseAnchor("graph-two_step")).toEqual({ kind: "graph", key: "two_step" })
    expect(parseAnchor("step-aggregate")).toEqual({ kind: "step", node: "aggregate" })
    expect(parseAnchor("change-claims_first")).toBeNull()
    expect(parseAnchor("")).toBeNull()
    expect(parseAnchor("elsewhere-x")).toBeNull()
    expect(parseAnchor("constructor-x")).toBeNull()
  })

  it("sends a flow value to its graph on the page or to the canvas of a project flow", () => {
    expect(flowTarget(VIEWS, "two_step")).toEqual({ kind: "graph", key: "two_step" })
    expect(flowTarget(VIEWS, "judge_panel_v2")).toEqual({ kind: "canvas", flow: "judge_panel_v2" })
    const value = { nodes: [ids.nodeId("classify")], value: "two_step", written: false }
    expect(valueAction("flow", VIEWS, [], ids.variantId("two_step"), value)).toEqual({ kind: "graph", key: "two_step" })
    expect(valueAction("prompt", VIEWS, [], ids.variantId("two_step"), value)).toEqual({ kind: "none" })
    expect(valueAction("flow", VIEWS, [], ids.variantId("x"), { ...value, value: null })).toEqual({ kind: "none" })
    const blocks = changeBlocks(promptExperiment)
    const claims = { nodes: JUDGES.map(ids.nodeId), value: "claims_first", written: false }
    expect(valueAction("prompt", VIEWS, blocks, ids.variantId("claims_first"), claims)).toEqual({ kind: "block", block: blocks[1] })
  })

  it("finds a node of the factor on the subject graph by its local id", () => {
    expect(slotStep(VIEWS, ids.nodeId("qwen"))).toEqual({ graph: "judge_panel", node: "judges__qwen" })
    expect(slotStep(VIEWS, ids.nodeId("condense"))).toBeNull()
  })
})

describe("page focus", () => {
  const blocks = changeBlocks(promptExperiment)
  const claims = blocks[1] ?? null

  it("opens a block and asks to scroll to it, and toggles it closed without scrolling", () => {
    const opened = openBlock(NO_FOCUS, claims)
    expect([...opened.open]).toEqual(["change-claims_first-deepseek"])
    expect(opened.scroll).toEqual({ id: "change-claims_first-deepseek", seq: 1 })
    expect(openBlock(opened, claims).scroll).toEqual({ id: "change-claims_first-deepseek", seq: 2 })
    const closed = toggleBlock(opened, "change-claims_first-deepseek")
    expect([...closed.open]).toEqual([])
    expect(closed.scroll).toBe(opened.scroll)
    expect(openBlock(NO_FOCUS, null)).toBe(NO_FOCUS)
  })

  it("highlights a graph on the page and selects a node of the factor on the subject graph", () => {
    expect(highlightGraph(NO_FOCUS, VIEWS, "two_step")).toMatchObject({ graph: "two_step", scroll: { id: "graph-two_step" } })
    expect(highlightGraph(NO_FOCUS, VIEWS, "absent")).toBe(NO_FOCUS)
    expect(focusSlot(NO_FOCUS, VIEWS, ids.nodeId("qwen"))).toMatchObject({ selection: { graph: "judge_panel", node: "judges__qwen" }, scroll: { id: "graph-judge_panel" } })
  })

  it("restores the focus from the anchor of the address", () => {
    expect(initialFocus(parseAnchor("change-claims_first-llama"), VIEWS, blocks).open.has("change-claims_first-deepseek")).toBe(true)
    expect(initialFocus(parseAnchor("graph-two_step"), VIEWS, blocks).graph).toBe("two_step")
    expect(initialFocus(parseAnchor("step-aggregate"), VIEWS, blocks).selection).toEqual({ graph: "judge_panel", node: "aggregate" })
    expect(initialFocus(null, VIEWS, blocks)).toBe(NO_FOCUS)
  })
})
