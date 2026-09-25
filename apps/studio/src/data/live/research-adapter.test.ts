import { describe, expect, it } from "vitest"
import type { ApiSeriesCaseRow, ApiSeriesDetail, ApiSeriesEta, ApiSubject } from "@/domain"
import { liveExperiments } from "@/mocks/data/experiments"
import { caseRowsOf, detailOf, initialSeries, launchPlanFor, RESEARCH_SERIES } from "@/mocks/data/research"
import {
  caseRowOf,
  experimentDetailOf,
  experimentSummaryOf,
  launchPlanOf,
  metricId,
  money,
  seriesDetailOf,
  seriesSummaryOf,
  subjectOf,
} from "./research-adapter"

const experiment = (id: string) => {
  const found = liveExperiments.find((item) => item.experiment_id === id)
  if (found === undefined) throw new Error(`no experiment ${id}`)
  return found
}

const seriesOf = (id: string): ApiSeriesDetail => {
  const found = initialSeries().find((item) => item.id === id)
  if (found === undefined) throw new Error(`no series ${id}`)
  return detailOf(found)
}

const rowsOf = (id: string): readonly ApiSeriesCaseRow[] => {
  const found = initialSeries().find((item) => item.id === id)
  if (found === undefined) throw new Error(`no series ${id}`)
  return caseRowsOf(found)
}

const subject = (fields: Partial<ApiSubject>): ApiSubject => ({ kind: "flow", flow_id: "judge_panel", local_flow: false, from_node: null, to_node: null, ...fields })

describe("research adapter", () => {
  it("reads decimal strings as numbers and keeps unknown values at zero", () => {
    expect(money("0.0125")).toBe(0.0125)
    expect(money("1.00")).toBe(1)
    expect(money(null)).toBe(0)
    expect(money("n/a")).toBe(0)
  })

  it("tells built-in metrics from checks", () => {
    expect(metricId("cost_of_pass")).toBe("cost_of_pass")
    expect(metricId("critique")).toBe("critique")
  })

  it("builds the subject union from its kind", () => {
    expect(subjectOf(subject({ kind: "flow", flow_id: "judge_panel" }))).toEqual({ kind: "flow", flow: "judge_panel", local: false })
    expect(subjectOf(subject({ kind: "range", flow_id: "support_case", from_node: "polish", to_node: "polish" }))).toEqual({
      kind: "range",
      flow: "support_case",
      local: false,
      range: { from: "polish", to: "polish" },
    })
    expect(subjectOf(subject({ kind: "range", flow_id: "escalation", local_flow: true, from_node: "escalate", to_node: "escalate" }))).toEqual({
      kind: "range",
      flow: "escalation",
      local: true,
      range: { from: "escalate", to: "escalate" },
    })
    expect(subjectOf(subject({ flow_id: "critique_only", local_flow: true }))).toEqual({ kind: "flow", flow: "critique_only", local: true })
  })

  it("maps an experiment summary and its full question, checks, variants and split counts", () => {
    const api = experiment("reply_noninferior_mistral")
    expect(experimentSummaryOf(api)).toMatchObject({ id: "reply_noninferior_mistral", question: "noninferior", baseline: "gpt", candidate: "mistral", spentUsd: 0 })
    const detail = experimentDetailOf(api)
    expect(detail.question).toEqual({
      kind: "noninferior",
      baseline: "gpt",
      candidate: "mistral",
      primary: "critique",
      direction: "higher_is_better",
      margin: 0.05,
      relative: false,
      guardrails: [{ metric: "cost_of_pass", direction: "lower_is_better", margin: 0.2, relative: true }],
    })
    expect(detail.cases).toEqual({ dataset: "support_case_cases", flow: "support_case", tags: {}, selected: 12, total: 12, splits: { dev: 6, holdout: 6 } })
    expect(detail.checks.map((check) => check.source)).toEqual([
      { kind: "judge", inference: "critique", agent: { id: "deepseek", model: "openrouter:deepseek/deepseek-v4-flash-0731" }, validatedBy: "critique_planted_defects" },
      { kind: "code", ref: "lumen.code.support_case:reply_keeps_resolution" },
    ])
    expect(detail.metrics[0]).toEqual({ id: "critique", role: "primary", direction: "higher_is_better", unit: "score", margin: 0.05, relative: false })
    expect(detail.variants[1]?.assignments[1]).toEqual({ node: "polish__revise", agent: { id: "mistral", model: "openrouter:mistralai/mistral-nemo" }, overridden: true })
    expect(detail.files).toEqual({ spec: "experiments/reply_noninferior_mistral/experiment.yaml", notes: "experiments/reply_noninferior_mistral/experiment.md" })
  })

  it("maps a threshold question and the steps of a flow of the experiment", () => {
    const detail = experimentDetailOf(experiment("critique_planted_defects"))
    expect(detail.question).toEqual({ kind: "threshold", metric: "label", bound: "above", value: 0.85, margin: 0.05, variant: "deepseek" })
    expect(detail.flows.map((flow) => flow.id)).toEqual(["critique_only"])
    expect(detail.flows[0]?.steps.map((step) => [step.node, step.kind, step.agent?.id ?? null])).toEqual([
      ["critique", "llm", "deepseek"],
      ["verdict", "code", null],
    ])
    expect(detail.varies).toBeNull()
    expect(detail.flow).toBeNull()
  })

  it("maps the factor, the changes of each variant, the alternatives and the prompts", () => {
    const prompts = experimentDetailOf(experiment("panel_judge_prompt"))
    expect(prompts.varies).toEqual({ what: "prompt", nodes: ["deepseek", "qwen", "llama"] })
    expect(prompts.variants.map((variant) => [variant.id, variant.changes.map((change) => `${change.node}:${change.what}:${change.value}`)])).toEqual([
      ["as_written", []],
      ["claims_first", ["deepseek:prompt:claims_first", "qwen:prompt:claims_first", "llama:prompt:claims_first"]],
      ["anchored_scale", ["deepseek:prompt:anchored_scale", "qwen:prompt:anchored_scale", "llama:prompt:anchored_scale"]],
    ])
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual(["anchored_scale", "claims_first"])
    const merge = experimentDetailOf(experiment("panel_merge_rule"))
    expect(merge.varies).toEqual({ what: "use", nodes: ["aggregate"] })
    expect(merge.alternatives.map((alternative) => [alternative.id, alternative.kind])).toEqual([
      ["always_tie_break", "code"],
      ["majority_only", "code"],
    ])
  })

  it("maps the slots as written with their files and the agents an agent factor names", () => {
    const merge = experimentDetailOf(experiment("panel_merge_rule"))
    expect(merge.slots).toEqual([
      {
        node: "aggregate",
        kind: "code",
        written: "aggregate",
        files: [
          { role: "node", path: "flows/judge_panel/nodes/aggregate/aggregate.node.yaml" },
          { role: "code", path: "flows/judge_panel/nodes/aggregate/aggregate.py" },
        ],
      },
    ])
    expect(merge.alternatives.find((alternative) => alternative.id === "majority_only")?.files.map((file) => file.role)).toEqual(["node", "code"])
    const agents = experimentDetailOf(experiment("judge_panel_agents"))
    expect(agents.slots.map((slot) => [slot.node, slot.written])).toEqual([["tie_break", "gpt"]])
    expect(agents.agents.map((agent) => [agent.id, agent.file, agent.spec.model])).toEqual([
      ["gpt", "agents/gpt.yaml", "openrouter:openai/gpt-oss-20b"],
      ["deepseek", "agents/deepseek.yaml", "openrouter:deepseek/deepseek-v4-flash-0731"],
    ])
  })

  it("maps the launch plan with its recommendation and cap, and no price", () => {
    const api = launchPlanFor(experiment("reply_noninferior_mistral"), { on: "dev" })
    const plan = launchPlanOf(api)
    expect(plan).toMatchObject({ request: { on: "dev", cases: 6, repeats: 3 }, attempts: 36, capUsd: 1, belowRecommended: true, recommended: { cases: 52, repeats: 3, reason: "short_of_cases" } })
    expect(Object.keys(plan)).not.toContain("usd")
  })

  it("maps a look series with its flow, dataset, cases and range", () => {
    const summary = seriesSummaryOf(seriesOf(RESEARCH_SERIES.lookWaiting))
    expect(summary.origin).toEqual({
      kind: "look",
      flow: "support_case",
      dataset: "support_case_cases",
      cases: ["strip_flicker_credit", "bulb_app_offline_advice", "lamp_crushed_box_reship"],
      range: null,
    })
    expect(summary.waits).toBe(2)
    const ranged = seriesSummaryOf({ ...seriesOf(RESEARCH_SERIES.lookWaiting), origin: { kind: "look", flow_id: "support_case", dataset_id: "d", case_names: ["a"], start_node: "polish", end_node: "finalize" } })
    expect(ranged.origin).toMatchObject({ range: { from: "polish", to: "finalize" } })
  })

  it("maps the matrix cells, contrasts and approval facts of a series", () => {
    const api = seriesOf(RESEARCH_SERIES.noninferiorHoldout)
    const detail = seriesDetailOf(api)
    const apiCell = api.matrix.rows[1]?.cells[0]
    const cell = detail.matrix.rows[1]?.cells[0]
    expect(cell).toEqual({ metric: "critique", value: apiCell?.value, ciLow: apiCell?.low, ciHigh: apiCell?.high, verdict: "pass", cases: apiCell?.cases })
    expect(detail.contrasts.map((contrast) => [contrast.metric, contrast.role, contrast.baseline, contrast.candidate])).toEqual([
      ["critique", "primary", "gpt", "mistral"],
      ["cost_of_pass", "guardrail", "gpt", "mistral"],
    ])
    expect(detail).toMatchObject({ needsApproval: false, approvedBy: null, error: null, spend: { capUsd: 1 } })
    expect(detail.findingPath).toBe(`experiments/reply_noninferior_mistral/findings/${RESEARCH_SERIES.noninferiorHoldout}.yaml`)
    expect(detail.spend.usd).toBeCloseTo(Number(api.spend.usd), 6)
  })

  it("carries how many attempts of a series ran on a model without a known price", () => {
    expect(seriesDetailOf(seriesOf(RESEARCH_SERIES.noninferiorHoldout)).spend.unpricedAttempts).toBe(0)
    expect(seriesSummaryOf(seriesOf(RESEARCH_SERIES.splitInconclusive)).spend.unpricedAttempts).toBe(6)
  })

  it("reads the estimate to finish of a series by its state", () => {
    const running = seriesOf(RESEARCH_SERIES.escalationRunning)
    const measured: ApiSeriesEta = { state: "running", attempts_per_minute: 12.5, remaining_seconds: 300, finish_at: "2026-09-18T03:05:00Z", window_seconds: 240 }
    const quiet: Omit<ApiSeriesEta, "state"> = { attempts_per_minute: null, remaining_seconds: null, finish_at: null, window_seconds: 0 }

    expect(seriesDetailOf({ ...running, eta: measured }).eta).toEqual({ state: "running", remainingSeconds: 300, finishAt: "2026-09-18T03:05:00Z", attemptsPerMinute: 12.5 })
    expect(seriesSummaryOf({ ...running, eta: { state: "estimating", ...quiet } }).eta).toEqual({ state: "estimating" })
    expect(seriesSummaryOf({ ...running, eta: { state: "paused", ...quiet } }).eta).toEqual({ state: "paused" })
    expect(seriesSummaryOf({ ...running, eta: { ...measured, finish_at: null } }).eta).toEqual({ state: "estimating" })
    expect(seriesSummaryOf({ ...running, eta: null }).eta).toBeNull()
    expect(seriesDetailOf(seriesOf(RESEARCH_SERIES.noninferiorHoldout)).eta).toBeNull()
  })

  it("maps case rows with their split and attempts with the error of the attempt", () => {
    const rows = rowsOf(RESEARCH_SERIES.panelFailed).map(caseRowOf)
    const attempts = rows.flatMap((row) => row.attempts)
    expect(rows[0]?.split).toBe("holdout")
    expect(attempts.some((attempt) => attempt.outcome === "error" && attempt.error === "OpenRouter answered 502 Bad Gateway for mistralai/mistral-nemo")).toBe(true)
    expect(attempts.filter((attempt) => attempt.outcome !== "error").every((attempt) => attempt.error === null)).toBe(true)
    expect(rowsOf(RESEARCH_SERIES.escalationRunning).map(caseRowOf).flatMap((row) => row.attempts).filter((attempt) => attempt.outcome === "running")).toHaveLength(1)
  })
})
