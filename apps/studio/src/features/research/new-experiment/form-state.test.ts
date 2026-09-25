import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { AS_WRITTEN, initialForm, reduceForm, slugOf, uniqueName } from "./form-state"
import { agentExperiment, CASES, formAfter, SUPPORT } from "./test-support"

const REVISE = ids.nodeId("revise")
const CLASSIFY = ids.nodeId("classify")

describe("slugOf", () => {
  it("turns words into a snake_case id that starts with a letter", () => {
    expect(slugOf("  2x Cheaper agent: holds quality?! ")).toBe("x_cheaper_agent_holds_quality")
  })

  it("gives nothing for text without latin letters", () => {
    expect(slugOf("дешёвый агент")).toBe("")
  })

  it("keeps an id within 63 characters", () => {
    expect(slugOf("word ".repeat(40)).length).toBeLessThanOrEqual(63)
  })
})

describe("uniqueName", () => {
  it("adds the first free number to a taken name", () => {
    expect(uniqueName("expected", ["expected", "expected_2"])).toBe("expected_3")
  })

  it("keeps a free name", () => {
    expect(uniqueName("latency", ["expected"])).toBe("latency")
  })
})

describe("reduceForm", () => {
  it("starts with the variant as written and one more", () => {
    expect(initialForm().variants.map((variant) => variant.id)).toEqual([AS_WRITTEN, "variant_2"])
  })

  it("derives the experiment id from the question until the id is typed", () => {
    const derived = formAfter({ type: "describe", text: "Mistral revises replies" })
    expect(derived.id).toBe("mistral_revises_replies")
    const typed = reduceForm(derived, { type: "rename", id: "mistral_revise" })
    expect(reduceForm(typed, { type: "describe", text: "Something else" }).id).toBe("mistral_revise")
  })

  it("resets the factor nodes, the values and the cases when the flow changes", () => {
    const form = reduceForm(agentExperiment(), { type: "chooseFlow", flow: ids.flowId("judge_panel"), dataset: null })
    expect(form.nodes).toEqual([])
    expect(form.variants.every((variant) => Object.keys(variant.values).length === 0)).toBe(true)
    expect(form.cases).toBeNull()
  })

  it("gives a variant named after its values its plain name back when the factor changes", () => {
    const form = reduceForm(agentExperiment(), { type: "chooseFactor", what: "prompt" })
    expect(form.variants.map((variant) => variant.id)).toEqual(["gpt", "variant_2"])
    expect(form.question).toMatchObject({ baseline: "gpt", candidate: "variant_2" })
    const named = reduceForm(reduceForm(agentExperiment(), { type: "renameVariant", key: 1, id: "small" }), { type: "chooseFactor", what: "prompt" })
    expect(named.variants[1]?.id).toBe("small")
  })

  it("selects the whole dataset the flow brings", () => {
    expect(formAfter({ type: "chooseFlow", flow: SUPPORT, dataset: CASES }).cases).toEqual({ dataset: CASES, tags: {} })
  })

  it("forgets the values of a node the factor no longer changes", () => {
    const form = reduceForm(agentExperiment(), { type: "toggleNode", node: REVISE })
    expect(form.nodes).toEqual([])
    expect(form.variants[1]?.values).toEqual({})
  })

  it("names an unnamed variant after the values it sets", () => {
    const form = agentExperiment()
    expect(form.variants.map((variant) => variant.id)).toEqual(["gpt", "mistral"])
    const both = reduceForm(reduceForm(form, { type: "toggleNode", node: CLASSIFY }), { type: "setValue", key: 1, node: CLASSIFY, value: "mistral" })
    expect(both.variants[1]?.id).toBe("mistral")
  })

  it("keeps a name the author typed", () => {
    const named = reduceForm(agentExperiment(), { type: "renameVariant", key: 1, id: "small_model" })
    expect(reduceForm(named, { type: "setValue", key: 1, node: REVISE, value: "gpt" }).variants[1]?.id).toBe("small_model")
  })

  it("never names a variant after another variant", () => {
    const form = reduceForm(agentExperiment(), { type: "setValue", key: 1, node: REVISE, value: "gpt" })
    expect(form.variants[1]?.id).toBe("gpt_2")
  })

  it("fills the pair and the metric when the question compares variants", () => {
    const form = formAfter({ type: "editQuestion", patch: { kind: "compare" } })
    expect(form.question).toMatchObject({ baseline: AS_WRITTEN, candidate: "variant_2", primary: "success_rate" })
  })

  it("follows a renamed variant in the question and drops a removed one", () => {
    const renamed = reduceForm(agentExperiment(), { type: "renameVariant", key: 1, id: "small" })
    expect(renamed.question).toMatchObject({ baseline: "gpt", candidate: "small" })
    const removed = reduceForm(renamed, { type: "removeVariant", key: 1 })
    expect(removed.variants.map((variant) => variant.id)).toEqual(["gpt"])
    expect(removed.question.candidate).toBe("")
  })

  it("keeps the variant as written", () => {
    expect(reduceForm(agentExperiment(), { type: "removeVariant", key: 0 }).variants).toHaveLength(2)
  })

  it("adds variants with fresh keys and free ids", () => {
    const form = formAfter({ type: "addVariant" }, { type: "addVariant" })
    expect(form.variants.map((variant) => [variant.key, variant.id])).toEqual([
      [0, AS_WRITTEN],
      [1, "variant_2"],
      [2, "variant_3"],
      [3, "variant_4"],
    ])
  })

  it("adds checks with free ids and follows a renamed check in the question", () => {
    const form = formAfter({ type: "addCheck", use: "expected", kind: "binary" }, { type: "addCheck", use: "expected", kind: "binary" }, { type: "editQuestion", patch: { kind: "threshold" } })
    expect(form.checks.map((check) => check.id)).toEqual(["expected", "expected_2"])
    expect(form.question.metric).toBe("expected")
    const [first] = form.checks
    if (first === undefined) throw new Error("no check")
    const renamed = reduceForm(form, { type: "editCheck", key: first.key, patch: { id: "intent" } })
    expect(renamed.question.metric).toBe("intent")
    expect(reduceForm(renamed, { type: "removeCheck", key: first.key }).question.metric).toBe("")
  })

  it("stores prompt text on the variant", () => {
    expect(formAfter({ type: "setPrompt", key: 1, text: "Be brief." }).variants[1]?.prompt).toBe("Be brief.")
  })
})
