import { describe, expect, it } from "vitest"
import type { ExperimentSpecJson } from "@/domain"
import * as ids from "@/data/ids"
import { authoringOptionsOf, caseCountOf, casesBody, specBody, writtenFileOf } from "./authoring-adapter"

describe("authoring adapter", () => {
  it("reads the options with tags sorted by name and both splits present", () => {
    const options = authoringOptionsOf({
      flows: [
        {
          flow_id: "support_case",
          description: "A support case from message to reply",
          input_type: "SupportCase",
          output_type: "Resolution",
          nodes: [{ node_id: "panel", flow_node_id: "panel", kind: "call", description: "Ask the judge panel", agent_id: null, inference_id: null, calls: "judge_panel" }],
        },
      ],
      agents: [{ agent_id: "gpt", model: "openrouter:openai/gpt-oss-20b" }],
      datasets: [
        {
          dataset_id: "support_case_cases",
          flow_id: "support_case",
          total: 3,
          splits: { dev: 3 },
          tags: { regression: [{ value: "no", count: 2 }], channel: [{ value: "amazon", count: 1 }] },
        },
      ],
      evaluators: [
        { use: "expected", needs_params: false, description: "Compares", kind: "binary", params: [{ name: "fields", required: false }] },
        { use: "cost_usd", needs_params: false, description: "Cost", kind: "continuous", params: [] },
      ],
      question_kinds: ["look", "compare"],
      metrics: ["success_rate"],
    })
    expect(options.flows[0]?.nodes[0]?.calls).toBe("judge_panel")
    expect(options.flows[0]?.description).toBe("A support case from message to reply")
    expect(options.flows[0]?.nodes[0]?.description).toBe("Ask the judge panel")
    expect(options.datasets[0]?.splits).toEqual({ dev: 3, holdout: 0 })
    expect(options.datasets[0]?.tags.map((tag) => tag.tag)).toEqual(["channel", "regression"])
    expect(options.evaluators).toEqual([
      { use: "expected", needsParams: false, description: "Compares", kind: "binary", params: [{ name: "fields", required: false }] },
      { use: "cost_usd", needsParams: false, description: "Cost", kind: "continuous", params: [] },
    ])
    expect(caseCountOf({ selected: 1, total: 3, splits: { holdout: 1 } })).toEqual({ selected: 1, total: 3, splits: { dev: 0, holdout: 1 } })
  })

  it("writes no tags as null so the file keeps a bare dataset", () => {
    expect(casesBody({ dataset: ids.datasetId("support_case_cases"), tags: {} })).toEqual({ dataset: "support_case_cases", tags: null })
    expect(casesBody({ dataset: ids.datasetId("support_case_cases"), tags: { regression: "yes" } })).toEqual({ dataset: "support_case_cases", tags: { regression: "yes" } })
  })

  it("reads the diagnostics of a written file", () => {
    const written = writtenFileOf({
      file: "experiments/reply_look/experiment.yaml",
      file_hash: "sha256-1",
      diagnostics: [{ code: "E_CASES_EMPTY", severity: "error", file: "experiments/reply_look/experiment.yaml", path: ["cases", "tags"], message: "empty" }],
    })
    expect(written.diagnostics).toEqual([{ code: "E_CASES_EMPTY", severity: "error", file: "experiments/reply_look/experiment.yaml", path: ["cases", "tags"], message: "empty", line: null, hint: null }])
  })

  it("sends the spec with the defaults the loader would fill and without the keys the author left out", () => {
    const spec: ExperimentSpecJson = {
      apiVersion: "aqven/v1",
      kind: "Experiment",
      description: "Is mistral as good as gpt on the reply?",
      subject: { flow: "support_case" },
      varies: { what: "agent", nodes: ["polish"] },
      cases: { dataset: "support_case_cases" },
      variants: [{ id: "as_written" }, { id: "mistral", nodes: { polish: "mistral" } }],
      checks: [{ id: "matches", kind: "binary", use: "expected", with: { fields: ["intent"] } }],
      question: { kind: "noninferior", baseline: "as_written", candidate: "mistral", primary: "matches", margin: 0.05, guardrails: [{ metric: "cost_usd", margin: 0.2 }] },
      plan: { repeats: 2 },
    }
    expect(specBody(spec)).toEqual({
      apiVersion: "aqven/v1",
      kind: "Experiment",
      description: "Is mistral as good as gpt on the reply?",
      archived: false,
      subject: { flow: "support_case" },
      varies: { what: "agent", nodes: ["polish"] },
      cases: { dataset: "support_case_cases" },
      variants: [{ id: "as_written" }, { id: "mistral", nodes: { polish: "mistral" } }],
      checks: [{ id: "matches", kind: "binary", use: "expected", with: { fields: ["intent"] } }],
      question: {
        kind: "noninferior",
        baseline: "as_written",
        candidate: "mistral",
        primary: "matches",
        margin: 0.05,
        guardrails: [{ metric: "cost_usd", margin: 0.2, relative: false }],
      },
      plan: { repeats: 2 },
    })
    expect(specBody({ ...spec, question: { kind: "threshold", metric: "success_rate", above: 0.8 }, plan: { cases: 10 } }).question).toEqual({ kind: "threshold", metric: "success_rate", above: 0.8, margin: 0 })
    expect(specBody({ ...spec, plan: { cases: 10 } }).plan).toEqual({ repeats: 1, cases: 10 })
  })

  it("names every write with a ULID, the id the files-first write service accepts", () => {
    expect(ids.writeOpId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(ids.writeOpId()).not.toBe(ids.writeOpId())
  })
})
