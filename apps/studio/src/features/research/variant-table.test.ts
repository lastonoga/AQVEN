import { describe, expect, it } from "vitest"
import type { ExperimentDetail, ExperimentVariant, ThresholdQuestion, VariantRole } from "@/domain"
import * as ids from "@/data/ids"
import { changeColumn, rowRole, shortModel, stepName, swapsBetween, variantTable, whereOf, whereView } from "./variant-table"

type Subject = Pick<ExperimentDetail, "subject" | "arms" | "variants" | "question">

const GPT = { id: ids.agentId("gpt"), model: "openrouter:openai/gpt-oss-20b" }
const MISTRAL = { id: ids.agentId("mistral"), model: "openrouter:mistralai/mistral-nemo" }
const TERSE_GPT = { id: ids.agentId("terse_gpt"), model: "openrouter:openai/gpt-oss-20b" }

const variant = (id: string, role: VariantRole, agents: Readonly<Record<string, typeof GPT>>, arm: string | null = null): ExperimentVariant => ({
  id: ids.variantId(id),
  arm: arm === null ? null : ids.armId(arm),
  role,
  assignments: Object.entries(agents).map(([node, agent]) => ({ node: ids.nodeId(node), agent, overridden: false })),
})

const FLOW = ids.flowId("support_case")

const pair = (variants: readonly ExperimentVariant[]): Subject => ({
  subject: { kind: "range", flow: FLOW, range: { from: ids.nodeId("polish"), to: ids.nodeId("polish") } },
  arms: [],
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
  })

  it("writes the difference from the baseline as the swapped models per step", () => {
    const baseline = variant("gpt", "baseline", { polish__critique: MISTRAL, polish__revise: GPT })
    const candidate = variant("mistral", "candidate", { polish__critique: MISTRAL, polish__revise: MISTRAL })
    const table = variantTable(pair([baseline, candidate]))
    expect(table.column).toEqual({ kind: "baseline" })
    expect(table.rows.map((row) => row.change)).toEqual([
      { kind: "reference" },
      { kind: "swaps", swaps: [{ node: "polish__revise", from: { short: "gpt-oss-20b", full: GPT.model }, to: { short: "mistral-nemo", full: MISTRAL.model } }] },
    ])
    expect(table.rows[0]?.models).toEqual([
      { short: "mistral-nemo", full: MISTRAL.model },
      { short: "gpt-oss-20b", full: GPT.model },
    ])
  })

  it("names the agents when the swap keeps the model", () => {
    const baseline = variant("gpt", "baseline", { revise: GPT })
    const candidate = variant("mistral", "candidate", { revise: TERSE_GPT })
    expect(swapsBetween(pair([baseline, candidate]), baseline, candidate)).toEqual([
      { node: "revise", from: { short: "gpt", full: "gpt" }, to: { short: "terse_gpt", full: "terse_gpt" } },
    ])
  })

  it("lists the steps of each arm when the variants run on different arms", () => {
    const experiment: Subject = {
      ...pair([variant("gpt", "baseline", { classify: GPT }), variant("mistral", "candidate", { condense: GPT, classify: GPT }, "two_step")]),
      subject: { kind: "arm", arm: ids.armId("one_step"), range: null },
      arms: [
        { id: ids.armId("one_step"), description: "", steps: [{ node: ids.nodeId("classify"), kind: "llm", agent: GPT, description: "" }] },
        {
          id: ids.armId("two_step"),
          description: "",
          steps: [
            { node: ids.nodeId("condense"), kind: "llm", agent: GPT, description: "" },
            { node: ids.nodeId("classify"), kind: "llm", agent: GPT, description: "" },
          ],
        },
      ],
    }
    const table = variantTable(experiment)
    expect(table.column).toEqual({ kind: "steps" })
    expect(table.rows.map((row) => row.change)).toEqual([
      { kind: "steps", steps: ["classify"] },
      { kind: "steps", steps: ["condense", "classify"] },
    ])
    expect(whereOf(experiment)).toEqual({ kind: "arms", arms: ["one_step", "two_step"] })
  })

  it("marks the variants a threshold or a look tests and drops the column for one variant", () => {
    const one = variant("deepseek", "other", { critique: GPT })
    const threshold: ThresholdQuestion = { kind: "threshold", metric: ids.checkId("label"), bound: "above", value: 0.85, margin: 0.05, variant: null }
    expect(rowRole(threshold, one)).toBe("tested")
    expect(rowRole({ ...threshold, variant: ids.variantId("qwen") }, one)).toBe("other")
    expect(rowRole({ kind: "look" }, one)).toBe("tested")
    expect(rowRole(pair([]).question, variant("gpt", "baseline", {}))).toBe("baseline")
    expect(changeColumn({ ...pair([one]), question: threshold })).toEqual({ kind: "none" })
    expect(changeColumn({ ...pair([one, variant("qwen", "other", { critique: MISTRAL })]), question: threshold })).toEqual({ kind: "reference", variant: "deepseek" })
  })

  it("keeps the subject as the place when every variant runs on it", () => {
    const experiment = pair([variant("gpt", "baseline", {}), variant("mistral", "candidate", {})])
    expect(whereOf(experiment)).toEqual(experiment.subject)
  })

  it("names the place by its kind and keeps the tested range", () => {
    const flow = ids.flowId("support_case")
    const range = { from: ids.nodeId("triage"), to: ids.nodeId("polish") }
    expect(whereView({ kind: "flow", flow })).toEqual({ kind: "flow", name: "support_case", range: null })
    expect(whereView({ kind: "range", flow, range })).toEqual({ kind: "flow", name: "support_case", range })
    expect(whereView({ kind: "arm", arm: ids.armId("critique_only"), range: null })).toEqual({ kind: "arm", name: "critique_only", range: null })
    expect(whereView({ kind: "arms", arms: [ids.armId("one_step"), ids.armId("two_step")] })).toEqual({ kind: "arms", name: "one_step, two_step", range: null })
  })
})
