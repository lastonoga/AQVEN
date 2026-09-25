import { describe, expect, it } from "vitest"
import type { AttemptOutcome, ExperimentCheck, SeriesAttempt } from "@/domain"
import * as ids from "@/data/ids"
import {
  checkHint,
  continuedCap,
  failedChecksOf,
  hasFilter,
  hasFinished,
  isLowerBound,
  isPending,
  isSpendPause,
  nextCapDraft,
  orderedAttempts,
  pendingOf,
  finishFormat,
  FINISH_CLOCK_FORMAT,
  rateDigits,
  shareOf,
  timeLeft,
  spendTone,
  tallyTone,
  toggledFilter,
  unpricedSpend,
  verdictGap,
  type CheckHintCopy,
} from "./series-presenters"
import { STARTED_FORMAT } from "./presenters"
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

describe("a series paused near its cap", () => {
  it("is a spend pause only while it awaits approval for spend near the cap", () => {
    const pause = { reason: "spend_near_cap", spentUsd: 0.91 } as const
    expect(isSpendPause(seriesSummary({ status: "awaiting_approval", pause }))).toBe(true)
    expect(isSpendPause(seriesSummary({ status: "awaiting_approval", pause: { reason: "cap_above_project", spentUsd: 0 } }))).toBe(false)
    expect(isSpendPause(seriesSummary({ status: "running", pause: null }))).toBe(false)
  })

  it("offers double the cap and continues only above the current cap", () => {
    expect(nextCapDraft(1)).toBe("2.00")
    expect(nextCapDraft(0.000001)).toBe("0.000002")
    expect(continuedCap(" 3.5 ", 1)).toBe(3.5)
    expect(continuedCap("1", 1)).toBeNull()
    expect(continuedCap("", 1)).toBeNull()
    expect(continuedCap("abc", 1)).toBeNull()
  })
})

describe("series estimate to finish", () => {
  it("rounds the time left up to whole minutes and splits hours off", () => {
    expect(timeLeft(0)).toEqual({ key: "underMinuteLeft", hours: 0, minutes: 0 })
    expect(timeLeft(59)).toEqual({ key: "underMinuteLeft", hours: 0, minutes: 0 })
    expect(timeLeft(61)).toEqual({ key: "minutesLeft", hours: 0, minutes: 2 })
    expect(timeLeft(300)).toEqual({ key: "minutesLeft", hours: 0, minutes: 5 })
    expect(timeLeft(3600)).toEqual({ key: "hoursLeft", hours: 1, minutes: 0 })
    expect(timeLeft(5430)).toEqual({ key: "hoursMinutesLeft", hours: 1, minutes: 31 })
  })

  it("shows the finish as a clock time, with the date once it is half a day away", () => {
    expect(finishFormat(300)).toBe(FINISH_CLOCK_FORMAT)
    expect(finishFormat(13 * 3600)).toBe(STARTED_FORMAT)
  })

  it("keeps one decimal of a slow speed and none of a fast one", () => {
    expect(rateDigits(0.4)).toBe(1)
    expect(rateDigits(9.5)).toBe(1)
    expect(rateDigits(12)).toBe(0)
  })
})
