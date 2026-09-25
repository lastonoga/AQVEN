import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { choicesFor, flowById, slotsOf, writtenValue } from "./factor"
import { formAfter, OPTIONS, SUPPORT } from "./test-support"
import { draftPrompt } from "./handoff"

const support = flowById(OPTIONS, SUPPORT)

const slot = (id: string) => {
  const found = support?.nodes.find((node) => node.id === ids.nodeId(id))
  if (found === undefined) throw new Error(`no node ${id}`)
  return found
}

describe("factor rules", () => {
  it("offers llm nodes for agent and prompt, call nodes for flow and every node for use", () => {
    expect(slotsOf(support, "agent").map((node) => node.id)).toEqual(["classify", "revise"])
    expect(slotsOf(support, "prompt").map((node) => node.id)).toEqual(["classify", "revise"])
    expect(slotsOf(support, "flow").map((node) => node.id)).toEqual(["panel"])
    expect(slotsOf(support, "use").map((node) => node.id)).toEqual(["classify", "revise", "panel", "route"])
  })

  it("offers the agents of the project with their models", () => {
    expect(choicesFor("agent", { slot: slot("revise"), options: OPTIONS, subject: SUPPORT })).toEqual([
      { value: "gpt", label: "gpt", detail: "openai:gpt-5.2-mini" },
      { value: "mistral", label: "mistral", detail: "mistral:mistral-small-2609" },
    ])
  })

  it("offers only flows with the input and output of the flow the slot calls", () => {
    expect(choicesFor("flow", { slot: slot("panel"), options: OPTIONS, subject: SUPPORT }).map((choice) => choice.value)).toEqual(["judge_panel", "solo_judge"])
  })

  it("shows what the flow has as written", () => {
    expect(writtenValue("agent", slot("revise"))).toBe("gpt")
    expect(writtenValue("flow", slot("panel"))).toBe("judge_panel")
    expect(writtenValue("prompt", slot("revise"))).toBeNull()
  })
})

describe("draftPrompt", () => {
  it("hands the chat the form as experiment JSON, the prompt texts and what is still open", () => {
    const form = formAfter(
      { type: "chooseFlow", flow: SUPPORT, dataset: null },
      { type: "chooseFactor", what: "prompt" },
      { type: "toggleNode", node: ids.nodeId("revise") },
      { type: "renameVariant", key: 1, id: "short" },
      { type: "setPrompt", key: 1, text: "Reply in two sentences." },
    )
    const text = draftPrompt(form, [{ place: "cases", code: "datasetMissing" }], (problem) => problem.code)
    expect(text).toContain("experiments/<experiment_id>/experiment.yaml")
    expect(text).toContain("- datasetMissing")
    expect(text).toContain('"what": "prompt"')
    expect(text).toContain("--- experiments/<experiment_id>/prompts/short.md\nReply in two sentences.")
  })

  it("asks the chat to write the alternatives of a use factor", () => {
    const form = formAfter({ type: "chooseFlow", flow: SUPPORT, dataset: null }, { type: "chooseFactor", what: "use" }, { type: "toggleNode", node: ids.nodeId("route") })
    expect(draftPrompt(form, [], String)).toContain("The factor is use on route")
  })
})
