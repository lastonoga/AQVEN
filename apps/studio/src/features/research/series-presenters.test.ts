import { describe, expect, it } from "vitest"
import type { AttemptOutcome, ExperimentCheck, SeriesAttempt } from "@/domain"
import * as ids from "@/data/ids"
import {
  checkHint,
  failedChecksOf,
  hasFilter,
  hasFinished,
  isLowerBound,
  isPending,
  orderedAttempts,
  pendingOf,
  shareOf,
  spendTone,
  tallyTone,
  toggledFilter,
  unpricedSpend,
  verdictGap,
  type CheckHintCopy,
} from "./series-presenters"
import { caseRow, seriesDetail, seriesSummary } from "./test-support"

const attempt = (variant: string, repeat: number, outcome: AttemptOutcome): SeriesAttempt => ({
  run: ids.runId(`${variant}-${String(repeat)}`),
  variant: ids.variantId(variant),
  repeat,
  passed: outcome === "passed",
  outcome,
  failedChecks: [],
  usd: 0.01,
  latencyMs: 1000,
  error: null,
})

describe("series header", () => {
  it("fills the meters and warns as spend nears the cap", () => {
    expect(shareOf(58, 108)).toBeCloseTo(0.537)
    expect(shareOf(3, 0)).toBe(0)
    expect(spendTone(seriesDetail({ spend: { usd: 0.4, capUsd: 1, unpricedAttempts: 0 } }))).toBe("neutral")
    expect(spendTone(seriesDetail({ spend: { usd: 0.85, capUsd: 1, unpricedAttempts: 0 } }))).toBe("warning")
    expect(spendTone(seriesDetail({ spend: { usd: 1.2, capUsd: 1, unpricedAttempts: 0 } }))).toBe("destructive")
  })

  it("calls the spend a lower bound once an attempt ran on a model without a price", () => {
    expect(isLowerBound({ unpricedAttempts: 0 })).toBe(false)
    expect(isLowerBound({ unpricedAttempts: 2 })).toBe(true)
  })

  it("adds up the unpriced attempts of the series that have any", () => {
    const spend = (unpricedAttempts: number) => ({ usd: 0.1, capUsd: 1, unpricedAttempts })
    const series = [seriesSummary({ spend: spend(0) }), seriesSummary({ spend: spend(3) }), seriesSummary({ spend: spend(2) })]
    expect(unpricedSpend(series)).toEqual({ attempts: 5, series: 2 })
    expect(unpricedSpend([])).toEqual({ attempts: 0, series: 0 })
  })

  it("explains a missing verdict by the question and the status", () => {
    expect(verdictGap(seriesDetail({ question: { kind: "look" }, status: "waiting_human" }))).toBe("look")
    expect(verdictGap(seriesDetail({ status: "running" }))).toBe("pending")
    expect(verdictGap(seriesDetail({ status: "done" }))).toBe("none")
    expect(verdictGap(seriesDetail({ status: "failed" }))).toBe("failed")
  })
})

describe("case rows", () => {
  it("colours k of n by how many attempts passed", () => {
    expect(tallyTone({ passed: 3, total: 3 })).toBe("success")
    expect(tallyTone({ passed: 1, total: 3 })).toBe("warning")
    expect(tallyTone({ passed: 0, total: 3 })).toBe("destructive")
    expect(tallyTone({ passed: 0, total: 0 })).toBe("neutral")
  })

  it("lists the failed checks of a case once across variants", () => {
    const row = caseRow({
      variants: [
        { variant: ids.variantId("gpt"), passed: 2, total: 3, failedChecks: [ids.checkId("promises")], usd: 0.03 },
        { variant: ids.variantId("mistral"), passed: 1, total: 3, failedChecks: [ids.checkId("promises"), ids.checkId("critique")], usd: 0.02 },
      ],
    })
    expect(failedChecksOf(row)).toEqual(["promises", "critique"])
    expect(hasFinished(row)).toBe(true)
    expect(hasFinished(caseRow({ variants: [{ variant: ids.variantId("gpt"), passed: 0, total: 0, failedChecks: [], usd: 0 }] }))).toBe(false)
  })

  it("orders attempts by variant, then repeat, and counts the pending ones by outcome", () => {
    const attempts = [attempt("mistral", 1, "failed"), attempt("gpt", 2, "passed"), attempt("gpt", 1, "waiting"), attempt("mistral", 2, "running")]
    expect(orderedAttempts(attempts, [ids.variantId("gpt"), ids.variantId("mistral")]).map((item) => item.run)).toEqual(["gpt-1", "gpt-2", "mistral-1", "mistral-2"])
    expect(pendingOf(caseRow({ attempts }), ids.variantId("gpt"), "waiting")).toBe(1)
    expect(pendingOf(caseRow({ attempts }), ids.variantId("mistral"), "waiting")).toBe(0)
    expect(pendingOf(caseRow({ attempts }), ids.variantId("mistral"), "running")).toBe(1)
    expect([isPending("running"), isPending("waiting"), isPending("error")]).toEqual([true, true, false])
  })

  it("toggles one case filter and keeps the other", () => {
    expect(toggledFilter({}, "failures")).toEqual({ failures: true })
    expect(toggledFilter({ failures: true }, "failures")).toEqual({})
    expect(toggledFilter({ failures: true }, "divergent")).toEqual({ failures: true, divergent: true })
    expect(hasFilter({})).toBe(false)
    expect(hasFilter({ divergent: true })).toBe(true)
  })
})

const HINT_COPY: CheckHintCopy = {
  builtin: (use) => `Built-in check ${use}`,
  fields: (fields) => `on ${fields}`,
  code: (ref) => `Code check · ${ref}`,
  judge: (inference) => `Judge · inference ${inference}`,
  agent: (agent) => `agent ${agent}`,
  validatedBy: (experiment) => `validated by ${experiment}`,
  notValidated: "not validated",
}

const DEEPSEEK = { id: ids.agentId("deepseek"), model: "openrouter:deepseek/deepseek-v4-flash-0731" }

const CHECKS: readonly ExperimentCheck[] = [
  { id: ids.checkId("promises"), kind: "binary", source: { kind: "code", ref: "lumen.code.support_case:reply_keeps_resolution" } },
  { id: ids.checkId("label"), kind: "binary", source: { kind: "builtin", use: "expected", fields: ["verdict", "reason"] } },
  { id: ids.checkId("quotes"), kind: "binary", source: { kind: "builtin", use: "citations_in_sources", fields: [] } },
  { id: ids.checkId("critique"), kind: "continuous", source: { kind: "judge", inference: "critique", agent: DEEPSEEK, validatedBy: ids.experimentId("critique_planted_defects") } },
  { id: ids.checkId("tone"), kind: "ordinal", source: { kind: "judge", inference: "tone", agent: null, validatedBy: null } },
]

const hintOf = (id: string): string | null => checkHint(CHECKS, ids.checkId(id), HINT_COPY)

describe("failed check hints", () => {
  it("names the function of a code check", () => {
    expect(hintOf("promises")).toBe("Code check · lumen.code.support_case:reply_keeps_resolution")
  })

  it("names a built-in check with the fields it reads, and without them when it reads none", () => {
    expect(hintOf("label")).toBe("Built-in check expected · on verdict, reason")
    expect(hintOf("quotes")).toBe("Built-in check citations_in_sources")
  })

  it("names the inference and agent of a judge and the experiment that validated it", () => {
    expect(hintOf("critique")).toBe("Judge · inference critique · agent deepseek · validated by critique_planted_defects")
    expect(hintOf("tone")).toBe("Judge · inference tone · not validated")
  })

  it("gives no hint for a check the series does not know", () => {
    expect(hintOf("ghost")).toBeNull()
    expect(checkHint([], ids.checkId("promises"), HINT_COPY)).toBeNull()
  })
})
