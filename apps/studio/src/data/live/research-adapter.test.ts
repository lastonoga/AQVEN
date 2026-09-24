import { describe, expect, it } from "vitest"
import type { ApiSeriesCaseRow, ApiSeriesDetail, ApiSubject } from "@/domain"
import { liveExperiments } from "@/mocks/data/experiments"
import { caseRowsOf, detailOf, estimateFor, initialSeries, RESEARCH_SERIES } from "@/mocks/data/research"
import {
  caseRowOf,
  estimateOf,
  experimentDetailOf,
  experimentSummaryOf,
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

const subject = (fields: Partial<ApiSubject>): ApiSubject => ({ kind: "flow", flow_id: null, arm_id: null, from_node: null, to_node: null, ...fields })

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
    expect(subjectOf(subject({ kind: "flow", flow_id: "judge_panel" }))).toEqual({ kind: "flow", flow: "judge_panel" })
    expect(subjectOf(subject({ kind: "range", flow_id: "support_case", from_node: "polish", to_node: "polish" }))).toEqual({
      kind: "range",
      flow: "support_case",
      range: { from: "polish", to: "polish" },
    })
    expect(subjectOf(subject({ kind: "arm", arm_id: "escalation", from_node: "escalate", to_node: "escalate" }))).toEqual({
      kind: "arm",
      arm: "escalation",
      range: { from: "escalate", to: "escalate" },
    })
    expect(subjectOf(subject({ kind: "arm", arm_id: "critique_only" }))).toEqual({ kind: "arm", arm: "critique_only", range: null })
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

  it("maps a threshold question and the steps of an arm", () => {
    const detail = experimentDetailOf(experiment("critique_planted_defects"))
    expect(detail.question).toEqual({ kind: "threshold", metric: "label", bound: "above", value: 0.85, margin: 0.05, variant: "deepseek" })
    expect(detail.arms[0]?.steps.map((step) => [step.node, step.kind, step.agent?.id ?? null])).toEqual([
      ["critique", "llm", "deepseek"],
      ["verdict", "code", null],
    ])
    expect(detail.flow).toBeNull()
  })

  it("keeps a missing price and time of the estimate as null", () => {
    const api = estimateFor(experiment("reply_noninferior_mistral"), { on: "dev" })
    expect(estimateOf(api)).toMatchObject({ request: { on: "dev", cases: 6, repeats: 3 }, usd: 0.45, usdSource: "history", capUsd: 1, recommended: { cases: 52, repeats: 3, reason: "short_of_cases" } })
    expect(estimateOf({ ...api, usd_source: "bound" })).toMatchObject({ usdSource: "bound" })
    expect(estimateOf({ ...api, usd: null, minutes: null })).toMatchObject({ usd: null, minutes: null })
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

  it("maps case rows with their split and attempts with the error of the attempt", () => {
    const rows = rowsOf(RESEARCH_SERIES.panelFailed).map(caseRowOf)
    const attempts = rows.flatMap((row) => row.attempts)
    expect(rows[0]?.split).toBe("holdout")
    expect(attempts.some((attempt) => attempt.outcome === "error" && attempt.error === "OpenRouter answered 502 Bad Gateway for mistralai/mistral-nemo")).toBe(true)
    expect(attempts.filter((attempt) => attempt.outcome !== "error").every((attempt) => attempt.error === null)).toBe(true)
    expect(rowsOf(RESEARCH_SERIES.escalationRunning).map(caseRowOf).flatMap((row) => row.attempts).filter((attempt) => attempt.outcome === "running")).toHaveLength(1)
  })
})
