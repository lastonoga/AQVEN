import { describe, expect, it } from "vitest"
import type { ExperimentDetail, ExperimentFactor, ExperimentVariant, FactorChange, FactorKind, FactorSlot, ThresholdQuestion, VariantRole } from "@/domain"
import * as ids from "@/data/ids"
import { changeAt, factorValues, localNode, nodesText, rowRole, shortModel, stepName, variantTable, whereView } from "./variant-table"

type Subject = Pick<ExperimentDetail, "varies" | "variants" | "question" | "slots">

const GPT = { id: ids.agentId("gpt"), model: "openrouter:openai/gpt-oss-20b" }
const MISTRAL = { id: ids.agentId("mistral"), model: "openrouter:mistralai/mistral-nemo" }

const change = (node: string, what: FactorKind, value: string): FactorChange => ({ node: ids.nodeId(node), what, value })

const variant = (id: string, role: VariantRole, agents: Readonly<Record<string, typeof GPT>>, changes: readonly FactorChange[] = []): ExperimentVariant => ({
  id: ids.variantId(id),
  role,
  changes,
  assignments: Object.entries(agents).map(([node, agent]) => ({ node: ids.nodeId(node), agent, overridden: false })),
})

const factor = (what: FactorKind, ...nodes: readonly string[]): ExperimentFactor => ({ what, nodes: nodes.map(ids.nodeId) })

const slot = (node: string, written: string | null): FactorSlot => ({ node: ids.nodeId(node), kind: "llm", written, files: [] })

const REVISE = [slot("revise", "gpt")]

const pair = (variants: readonly ExperimentVariant[], varies: ExperimentFactor | null = factor("agent", "revise")): Subject => ({
  varies,
  slots: varies === null ? [] : REVISE,
  variants,
  question: {
    kind: "noninferior",
    baseline: ids.variantId("gpt"),
    candidate: ids.variantId("mistral"),
    primary: ids.checkId("critique"),
    direction: "higher_is_better",
    margin: 0.05,
    relative: false,
    guardrails: [],
  },
})

describe("variant table", () => {
  it("shortens a model id to its name and a nested step to its path", () => {
    expect(shortModel("openrouter:meta-llama/llama-3.1-8b-instruct:free")).toBe("llama-3.1-8b-instruct:free")
    expect(shortModel("anthropic:claude-sonnet-4-5")).toBe("claude-sonnet-4-5")
    expect(shortModel("gpt-4o")).toBe("gpt-4o")
    expect(stepName("polish__revise")).toBe("polish › revise")
    expect(stepName("decide__tie_break")).toBe("decide › tie_break")
    expect(localNode("polish__revise")).toBe("revise")
    expect(localNode("triage")).toBe("triage")
  })

  it("carries the factor and gives each variant its value, the subject as written by its own value", () => {
    const baseline = variant("gpt", "baseline", { polish__critique: MISTRAL, polish__revise: GPT })
    const candidate = variant("mistral", "candidate", { polish__critique: MISTRAL, polish__revise: MISTRAL }, [change("revise", "agent", "mistral")])
    const table = variantTable(pair([baseline, candidate]))
    expect(table.factor).toEqual({ what: "agent", nodes: ["revise"] })
    expect(table.rows.map((row) => [row.id, row.role, row.values])).toEqual([
      ["gpt", "baseline", [{ nodes: ["revise"], value: "gpt", written: true }]],
      ["mistral", "candidate", [{ nodes: ["revise"], value: "mistral", written: false }]],
    ])
    expect(table.rows[0]?.agents).toEqual([
      { agent: MISTRAL.id, model: { short: "mistral-nemo", full: MISTRAL.model } },
      { agent: GPT.id, model: { short: "gpt-oss-20b", full: GPT.model } },
    ])
    expect(table.models).toBe(true)
  })

  it("groups the nodes a variant sets to one value", () => {
    const prompts = factor("prompt", "deepseek", "qwen", "llama")
    const slots = ["deepseek", "qwen", "llama"].map((node) => slot(node, "tie_break"))
    const everyNode = variant("claims_first", "other", {}, ["deepseek", "qwen", "llama"].map((node) => change(node, "prompt", "claims_first")))
    expect(factorValues(prompts, slots, everyNode)).toEqual([{ nodes: ["deepseek", "qwen", "llama"], value: "claims_first", written: false }])
    expect(factorValues(prompts, slots, variant("as_written", "baseline", {}))).toEqual([{ nodes: ["deepseek", "qwen", "llama"], value: "tie_break", written: true }])
  })

  it("keeps the nodes a variant leaves as written apart from the nodes it sets, even to the same value", () => {
    const agents = factor("agent", "gpt", "gemini", "mistral")
    const slots = [slot("gpt", "gpt"), slot("gemini", "gemini"), slot("mistral", "mistral")]
    const some = variant("mistral_only", "other", {}, [change("gpt", "agent", "mistral"), change("gemini", "agent", "mistral")])
    expect(factorValues(agents, slots, some)).toEqual([
      { nodes: ["gpt", "gemini"], value: "mistral", written: false },
      { nodes: ["mistral"], value: "mistral", written: true },
    ])
    expect(factorValues(agents, [], variant("none", "other", {}))).toEqual([{ nodes: ["gpt", "gemini", "mistral"], value: null, written: true }])
    expect(nodesText([ids.nodeId("gpt"), ids.nodeId("polish__revise")])).toBe("gpt, polish › revise")
  })

  it("has no value column without a factor and hides the models column when no variant runs an agent", () => {
    const table = variantTable(pair([variant("current", "other", {})], null))
    expect(table.factor).toBeNull()
    expect(table.rows.map((row) => row.values)).toEqual([[]])
    expect(table.models).toBe(false)
  })

  it("finds the change a variant makes on a node", () => {
    const swapped = variant("one_reader", "candidate", {}, [change("panel", "flow", "one_reader")])
    expect(changeAt(swapped, ids.nodeId("panel"))).toEqual({ node: "panel", what: "flow", value: "one_reader" })
    expect(changeAt(swapped, ids.nodeId("gather"))).toBeNull()
  })

  it("marks the variants a threshold or a look tests", () => {
    const one = variant("deepseek", "other", { critique: GPT })
    const threshold: ThresholdQuestion = { kind: "threshold", metric: ids.checkId("label"), bound: "above", value: 0.85, margin: 0.05, variant: null }
    expect(rowRole(threshold, one)).toBe("tested")
    expect(rowRole({ ...threshold, variant: ids.variantId("qwen") }, one)).toBe("other")
    expect(rowRole({ kind: "look" }, one)).toBe("tested")
    expect(rowRole(pair([]).question, variant("gpt", "baseline", {}))).toBe("baseline")
  })

  it("names the place by its kind and keeps the tested range", () => {
    const flow = ids.flowId("support_case")
    const range = { from: ids.nodeId("triage"), to: ids.nodeId("polish") }
    expect(whereView({ kind: "flow", flow, local: false })).toEqual({ kind: "flow", name: "support_case", range: null })
    expect(whereView({ kind: "range", flow, local: false, range })).toEqual({ kind: "flow", name: "support_case", range })
    expect(whereView({ kind: "flow", flow: ids.flowId("critique_only"), local: true })).toEqual({ kind: "local", name: "critique_only", range: null })
  })
})
