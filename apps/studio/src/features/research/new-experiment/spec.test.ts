import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { reduceForm } from "./form-state"
import { createOf, promptsOf, specOf } from "./spec"
import { agentExperiment, CASES, formAfter, SUPPORT } from "./test-support"

const REVISE = ids.nodeId("revise")
const CLASSIFY = ids.nodeId("classify")

describe("specOf", () => {
  it("writes an agent factor as the loader reads it", () => {
    expect(specOf(agentExperiment())).toEqual({
      apiVersion: "aqven/v1",
      kind: "Experiment",
      description: "Mistral revises replies as well as GPT",
      subject: { flow: "support_case" },
      varies: { what: "agent", nodes: ["revise"] },
      cases: { dataset: "support_case_cases" },
      variants: [{ id: "gpt" }, { id: "mistral", nodes: { revise: "mistral" } }],
      question: { kind: "noninferior", baseline: "gpt", candidate: "mistral", primary: "success_rate", margin: 0.05 },
      plan: { repeats: 1 },
    })
  })

  it("names the prompt file of a variant after it and points every factor node at it", () => {
    const form = formAfter(
      { type: "describe", text: "A shorter prompt classifies as well" },
      { type: "chooseFlow", flow: SUPPORT, dataset: CASES },
      { type: "chooseFactor", what: "prompt" },
      { type: "toggleNode", node: CLASSIFY },
      { type: "toggleNode", node: REVISE },
      { type: "renameVariant", key: 1, id: "short" },
      { type: "setPrompt", key: 1, text: "Answer in one word." },
    )
    expect(specOf(form).variants).toEqual([{ id: "as_written" }, { id: "short", nodes: { classify: "short", revise: "short" } }])
    expect(promptsOf(form)).toEqual({ short: "Answer in one word." })
  })

  it("leaves out varies when every variant runs the flow as written", () => {
    const spec = specOf(formAfter({ type: "chooseFlow", flow: SUPPORT, dataset: CASES }))
    expect(spec).not.toHaveProperty("varies")
    expect(spec.variants).toEqual([{ id: "as_written" }, { id: "variant_2" }])
  })

  it("writes the tags, the checks with their parameters and the plan", () => {
    const form = formAfter(
      { type: "chooseFlow", flow: SUPPORT, dataset: CASES },
      { type: "chooseCases", cases: { dataset: CASES, tags: { language: "de" } } },
      { type: "addCheck", use: "expected", kind: "binary" },
      { type: "addCheck", use: "max_words", kind: "binary" },
      { type: "editCheck", key: 2, patch: { fields: "intent, priority" } },
      { type: "editCheck", key: 3, patch: { params: "{\"max\": 120}", kind: "binary" } },
      { type: "editPlan", patch: { cases: "8", repeats: "3" } },
    )
    const spec = specOf(form)
    expect(spec.cases).toEqual({ dataset: "support_case_cases", tags: { language: "de" } })
    expect(spec.checks).toEqual([
      { id: "expected", kind: "binary", use: "expected", with: { fields: ["intent", "priority"] } },
      { id: "max_words", kind: "binary", use: "max_words", with: { max: 120 } },
    ])
    expect(spec.plan).toEqual({ cases: 8, repeats: 3 })
  })

  it("writes a threshold on one variant with its bound", () => {
    const form = reduceForm(agentExperiment(), { type: "editQuestion", patch: { kind: "threshold", metric: "cost_usd", bound: "below", value: "0.01", variant: "mistral", margin: "" } })
    expect(specOf(form).question).toEqual({ kind: "threshold", metric: "cost_usd", variant: "mistral", below: 0.01, margin: 0 })
  })

  it("writes a look as its kind alone", () => {
    expect(specOf(formAfter()).question).toEqual({ kind: "look" })
  })
})

describe("createOf", () => {
  it("sends the experiment id, the spec and no prompts for an agent factor", () => {
    const form = reduceForm(agentExperiment(), { type: "rename", id: "reply_mistral" })
    expect(createOf(form)).toMatchObject({ experiment: "reply_mistral", prompts: {} })
  })
})
