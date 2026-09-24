import { describe, expect, it } from "vitest"
import type { ExperimentQuestion, LaunchEstimate, MetricColumn } from "@/domain"
import * as ids from "@/data/ids"
import { intervalText, marginText, metricName, metricValue, signedValue } from "./metrics"
import {
  activeSeries,
  checkLaunch,
  failureModes,
  guardrailSentences,
  latestBadge,
  launchReason,
  planLaunch,
  plannedCases,
  questionSentence,
  shortfallOf,
  shownRole,
  subjectText,
  tagPairs,
  variantsText,
  withFilter,
  type QuestionCopy,
  type ReasonCopy,
  type SubjectCopy,
} from "./presenters"
import { experimentSummary, seriesSummary } from "./test-support"

const SUBJECT: SubjectCopy = {
  flow: (flow) => `flow ${flow}`,
  range: (flow, range) => `${flow} · ${range}`,
  arm: (arm) => `arm ${arm}`,
  armRange: (arm, range) => `arm ${arm} · ${range}`,
}

const QUESTION: QuestionCopy = {
  look: () => "look",
  threshold: (values) => `${values.variant} keeps ${values.metric} ${values.bound} ${values.value} ± ${values.margin}`,
  thresholdAll: (values) => `all keep ${values.metric} ${values.bound} ${values.value} ± ${values.margin}`,
  compare: (values) => `${values.candidate} beats ${values.baseline} on ${values.metric} by ${values.margin}`,
  noninferior: (values) => `${values.candidate} not worse than ${values.baseline} on ${values.metric} by ${values.margin}`,
  guardrail: (values) => `${values.metric} ≤ ${values.margin}`,
  builtin: (metric) => metric.replaceAll("_", " "),
}

const REASON: ReasonCopy = {
  look: () => "look",
  wide: (values) => `wide ${String(values.cases)} ±${values.halfWidth} > ${values.margin}, need ${String(values.recommended)}`,
  enough: (values) => `enough ±${values.halfWidth} < ${values.margin}`,
  no_margin: (values) => `plan ${String(values.recommended)}`,
  no_history: (values) => `no history, plan ${String(values.recommended)}`,
  short_of_cases: (values) => `need ${String(values.recommended)} of ${String(values.available)} within ${values.margin}`,
}

const column = (id: MetricColumn["id"], role: MetricColumn["role"], unit: MetricColumn["unit"], margin: number | null = null, relative = false): MetricColumn => ({
  id,
  role,
  unit,
  direction: "higher_is_better",
  margin,
  relative,
})

const PAIR: ExperimentQuestion = {
  kind: "noninferior",
  baseline: ids.variantId("gpt"),
  candidate: ids.variantId("mistral"),
  primary: ids.checkId("critique"),
  direction: "higher_is_better",
  margin: 0.05,
  relative: false,
  guardrails: [{ metric: "cost_of_pass", direction: "lower_is_better", margin: 0.2, relative: true }],
}

const METRICS: readonly MetricColumn[] = [column(ids.checkId("critique"), "primary", "score", 0.05), column("cost_of_pass", "guardrail", "usd", 0.2, true)]

const estimate = (fields: Partial<LaunchEstimate>): LaunchEstimate => ({
  request: { on: "dev", cases: 12, repeats: 3 },
  variants: 2,
  attempts: 72,
  usd: 0.91,
  minutes: 2,
  available: 12,
  halfWidth: 0.12,
  margin: 0.05,
  recommended: { cases: 65, repeats: 3, reason: "wide" },
  belowRecommended: true,
  needsApproval: false,
  capUsd: 1,
  ...fields,
})

describe("experiment list rows", () => {
  it("names the subject of each kind in plain words", () => {
    const flow = ids.flowId("support_case")
    const range = { from: ids.nodeId("polish"), to: ids.nodeId("polish") }
    expect(subjectText({ kind: "flow", flow }, SUBJECT)).toBe("flow support_case")
    expect(subjectText({ kind: "range", flow, range }, SUBJECT)).toBe("support_case · polish")
    expect(subjectText({ kind: "range", flow, range: { from: ids.nodeId("triage"), to: ids.nodeId("route") } }, SUBJECT)).toBe("support_case · triage → route")
    expect(subjectText({ kind: "arm", arm: ids.armId("one_step"), range: null }, SUBJECT)).toBe("arm one_step")
    expect(subjectText({ kind: "arm", arm: ids.armId("escalation"), range }, SUBJECT)).toBe("arm escalation · polish")
  })

  it("shows the variants as baseline to candidate and keeps the others after them", () => {
    expect(variantsText(experimentSummary({}))).toBe("gpt → mistral")
    expect(variantsText(experimentSummary({ variants: [ids.variantId("deepseek"), ids.variantId("qwen"), ids.variantId("gpt")], baseline: ids.variantId("deepseek"), candidate: ids.variantId("qwen") }))).toBe(
      "deepseek → qwen, gpt",
    )
    expect(variantsText(experimentSummary({ variants: [ids.variantId("current")], baseline: null, candidate: null }))).toBe("current")
  })

  it("reads the last series as its verdict, or its status while it has none", () => {
    const copy = { verdict: (state: string) => `verdict:${state}`, status: (status: string) => `status:${status}`, split: (split: string) => split }
    expect(latestBadge(null, copy)).toBeNull()
    expect(latestBadge({ id: ids.seriesId("s1"), on: "dev", status: "done", verdict: "signal" }, copy)).toEqual({ label: "verdict:signal", tone: "llm", detail: "dev" })
    expect(latestBadge({ id: ids.seriesId("s2"), on: "holdout", status: "awaiting_approval", verdict: null }, copy)).toEqual({
      label: "status:awaiting_approval",
      tone: "warning",
      detail: "holdout",
    })
  })

  it("collects the flows and failure modes offered by the filters", () => {
    const experiments = [experimentSummary({}), experimentSummary({ id: ids.experimentId("arm_only"), flow: null, failureMode: "intent_misread" }), experimentSummary({ failureMode: null })]
    expect(failureModes(experiments)).toEqual(["intent_misread", "reply_quality"])
  })

  it("sets, keeps and clears one filter at a time", () => {
    const filter = { flow: ids.flowId("support_case"), failureMode: "overpromise" }
    expect(withFilter(filter, { question: "threshold" })).toEqual({ flow: "support_case", question: "threshold", failureMode: "overpromise" })
    expect(withFilter(filter, { flow: null })).toEqual({ failureMode: "overpromise" })
    expect(withFilter({}, { failureMode: null })).toEqual({})
  })

  it("writes case tags as key=value pairs", () => {
    expect(tagPairs({ regression: "yes", channel: "amazon" })).toEqual(["regression=yes", "channel=amazon"])
  })
})

describe("the question in plain words", () => {
  it("says a non-inferiority question with its margin and guardrails", () => {
    expect(questionSentence(PAIR, METRICS, QUESTION)).toBe("mistral not worse than gpt on critique by 0.05")
    expect(guardrailSentences(PAIR, METRICS, QUESTION)).toEqual(["cost of pass ≤ 20%"])
  })

  it("says a comparison on a built-in metric in its unit", () => {
    const question: ExperimentQuestion = { ...PAIR, kind: "compare", primary: "latency_p50_ms", margin: 1500, guardrails: [] }
    expect(questionSentence(question, [column("latency_p50_ms", "primary", "ms", 1500)], QUESTION)).toBe("mistral beats gpt on latency p50 ms by 1.50 s")
    expect(guardrailSentences(question, [], QUESTION)).toEqual([])
  })

  it("says a threshold for one variant or for every variant", () => {
    const metric = ids.checkId("promises")
    const threshold: ExperimentQuestion = { kind: "threshold", metric, bound: "above", value: 0.97, margin: 0.01, variant: null }
    const metrics = [column(metric, "primary", "rate", 0.01)]
    expect(questionSentence(threshold, metrics, QUESTION)).toBe("all keep promises above 0.97 ± 0.01")
    expect(questionSentence({ ...threshold, variant: ids.variantId("gpt") }, metrics, QUESTION)).toBe("gpt keeps promises above 0.97 ± 0.01")
    expect(questionSentence({ kind: "look" }, [], QUESTION)).toBe("look")
  })
})

describe("launch", () => {
  it("explains the recommended number of cases by its reason", () => {
    expect(launchReason(estimate({}), METRICS, REASON)).toBe("wide 12 ±0.12 > 0.05, need 65")
    expect(launchReason(estimate({ halfWidth: 0.04, recommended: { cases: 12, repeats: 3, reason: "enough" } }), METRICS, REASON)).toBe("enough ±0.04 < 0.05")
    expect(launchReason(estimate({ halfWidth: null, margin: null, recommended: { cases: 5, repeats: 1, reason: "look" } }), [], REASON)).toBe("look")
    expect(launchReason(estimate({ recommended: { cases: 8, repeats: 3, reason: "no_margin" } }), METRICS, REASON)).toBe("plan 8")
    expect(launchReason(estimate({ recommended: { cases: 8, repeats: 3, reason: "no_history" } }), METRICS, REASON)).toBe("no history, plan 8")
    expect(launchReason(estimate({ available: 6, recommended: { cases: 52, repeats: 3, reason: "short_of_cases" } }), METRICS, REASON)).toBe("need 52 of 6 within 0.05")
  })

  it("warns below the recommendation and says when the selection is too small for it", () => {
    expect(shortfallOf(estimate({}))).toBe("belowAvailable")
    expect(shortfallOf(estimate({ recommended: { cases: 10, repeats: 3, reason: "wide" }, request: { on: "dev", cases: 8, repeats: 3 } }))).toBe("below")
    expect(shortfallOf(estimate({ belowRecommended: false }))).toBeNull()
  })

  it("accepts whole numbers of cases up to the selection and repeats up to 20", () => {
    expect(checkLaunch({ on: "holdout", cases: "12", repeats: "3" }, 12)).toEqual({ kind: "valid", request: { on: "holdout", cases: 12, repeats: 3 } })
    expect(checkLaunch({ on: "dev", cases: "0", repeats: "3" }, 12)).toEqual({ kind: "invalid", problems: ["cases"] })
    expect(checkLaunch({ on: "dev", cases: "13", repeats: "21" }, 12)).toEqual({ kind: "invalid", problems: ["cases", "repeats"] })
    expect(checkLaunch({ on: "dev", cases: "2.5", repeats: "" }, 12)).toEqual({ kind: "invalid", problems: ["cases", "repeats"] })
  })

  it("plans the launch within the cases the split holds", () => {
    const experiment = {
      cases: { dataset: ids.datasetId("support_case_cases"), flow: ids.flowId("support_case"), tags: {}, selected: 12, total: 12, splits: { dev: 6, holdout: 4 } },
      plan: { cases: 12, repeats: 3 },
    }
    expect(planLaunch(experiment)).toEqual({ on: "dev", cases: 6, repeats: 3 })
    expect(plannedCases(experiment, "holdout")).toBe(4)
    expect(plannedCases({ ...experiment, plan: { cases: 2, repeats: 1 } }, "dev")).toBe(2)
  })

  it("finds the series that is still active", () => {
    const done = seriesSummary({ status: "done" })
    const awaiting = seriesSummary({ id: ids.seriesId("awaiting"), status: "awaiting_approval" })
    expect(activeSeries([done, awaiting])?.id).toBe("awaiting")
    expect(activeSeries([done])).toBeNull()
  })
})

describe("variant roles", () => {
  it("shows no role for the variant of a look and keeps the role elsewhere", () => {
    expect(shownRole("other", "look")).toBeNull()
    expect(shownRole("baseline", "noninferior")).toBe("baseline")
    expect(shownRole("candidate", "threshold")).toBe("candidate")
    expect(shownRole("other", "compare")).toBe("other")
  })
})

describe("metric values", () => {
  it("formats each unit and relative margins", () => {
    expect(metricValue(0.934, "rate")).toBe("0.93")
    expect(metricValue(3.25, "ordinal")).toBe("3.3")
    expect(metricValue(0.01346, "usd")).toBe("$0.01")
    expect(metricValue(0.00096, "usd")).toBe("$0.00096")
    expect(metricValue(5212, "ms")).toBe("5.21 s")
    expect(marginText(0.2, "usd", true)).toBe("20%")
    expect(marginText(0.05, "score", false)).toBe("0.05")
    expect(intervalText(0.75, 0.82, "score")).toBe("0.75–0.82")
    expect(signedValue(-0.02, "score")).toBe("−0.02")
    expect(signedValue(0.1, "rate")).toBe("+0.10")
    expect(metricName("infra_error_rate", (metric) => `builtin:${metric}`)).toBe("builtin:infra_error_rate")
    expect(metricName(ids.checkId("critique"), (metric) => `builtin:${metric}`)).toBe("critique")
  })
})
