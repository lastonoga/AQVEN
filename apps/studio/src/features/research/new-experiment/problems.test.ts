import { describe, expect, it } from "vitest"
import * as ids from "@/data/ids"
import { initialForm, reduceForm, type NewExperimentForm } from "./form-state"
import { formProblems, type FormProblem } from "./problems"
import { agentExperiment, formAfter, OPTIONS, SUPPORT } from "./test-support"

const REVISE = ids.nodeId("revise")
const ROUTE = ids.nodeId("route")

const problemsOf = (form: NewExperimentForm, taken: readonly string[] = []): readonly FormProblem[] => formProblems(form, { options: OPTIONS, taken })

const codes = (form: NewExperimentForm, taken: readonly string[] = []): readonly string[] => problemsOf(form, taken).map((problem) => problem.code)

describe("formProblems", () => {
  it("accepts a complete agent experiment", () => {
    expect(problemsOf(agentExperiment())).toEqual([])
  })

  it("asks for the question, the flow and the dataset of an empty form", () => {
    expect(problemsOf(initialForm())).toEqual([
      { place: "description", code: "descriptionMissing" },
      { place: "id", code: "idMissing" },
      { place: "subject", code: "flowMissing" },
      { place: "cases", code: "datasetMissing" },
    ])
  })

  it("rejects an id that breaks the pattern or is taken", () => {
    expect(codes(reduceForm(agentExperiment(), { type: "rename", id: "Reply-Mistral" }))).toEqual(["idPattern"])
    expect(codes(agentExperiment(), ["mistral_revises_replies_as_well_as_gpt"])).toEqual(["idTaken"])
  })

  it("asks every further variant to set a value once the factor has nodes", () => {
    const form = reduceForm(agentExperiment(), { type: "addVariant" })
    expect(problemsOf(form)).toEqual([{ place: "variant:2", code: "variantValueMissing" }])
  })

  it("allows an A/A experiment without factor nodes", () => {
    const form = reduceForm(agentExperiment(), { type: "toggleNode", node: REVISE })
    expect(problemsOf(form)).toEqual([])
  })

  it("rejects duplicate and malformed variant ids", () => {
    const form = reduceForm(reduceForm(agentExperiment(), { type: "renameVariant", key: 1, id: "gpt" }), { type: "addVariant" })
    const renamed = reduceForm(form, { type: "renameVariant", key: 2, id: "9lives" })
    expect(codes(renamed)).toEqual(expect.arrayContaining(["variantIdDuplicate", "variantIdPattern"]))
  })

  it("sends a use factor to the chat", () => {
    const form = formAfter({ type: "chooseFlow", flow: SUPPORT, dataset: null }, { type: "chooseFactor", what: "use" }, { type: "toggleNode", node: ROUTE })
    expect(codes(form)).toContain("useNeedsChat")
    expect(codes(form)).not.toContain("variantValueMissing")
  })

  it("asks a not-worse question for a margin above zero", () => {
    expect(codes(reduceForm(agentExperiment(), { type: "editQuestion", patch: { margin: "0" } }))).toEqual(["marginPositive"])
  })

  it("asks a comparison for two different known variants and a known metric", () => {
    const same = reduceForm(agentExperiment(), { type: "editQuestion", patch: { candidate: "gpt" } })
    expect(codes(same)).toEqual(["pairSame"])
    const unknown = reduceForm(agentExperiment(), { type: "editQuestion", patch: { primary: "accuracy" } })
    expect(codes(unknown)).toEqual(["metricUnknown"])
  })

  it("checks the threshold value, margin and variant", () => {
    const form = reduceForm(agentExperiment(), { type: "editQuestion", patch: { kind: "threshold", metric: "cost_usd", value: "cheap", margin: "-1", variant: "claude" } })
    expect(codes(form)).toEqual(["valueInvalid", "marginInvalid", "variantUnknown"])
  })

  it("checks the plan and the check parameters", () => {
    const form = formAfter({ type: "addCheck", use: "max_words", kind: "binary" }, { type: "editCheck", key: 2, patch: { params: "[1]" } }, { type: "editPlan", patch: { cases: "0", repeats: "21" } })
    expect(problemsOf(form)).toEqual(
      expect.arrayContaining([
        { place: "check:2", code: "checkParamsInvalid" },
        { place: "plan", code: "planCasesInvalid" },
        { place: "plan", code: "planRepeatsInvalid" },
      ]),
    )
  })
})
