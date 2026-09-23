import { describe, expect, it } from "vitest"
import type { AttemptOutcome, SeriesAttempt } from "@/domain"
import * as ids from "@/data/ids"
import { failedChecksOf, hasFilter, hasFinished, isPending, orderedAttempts, pendingOf, shareOf, spendTone, tallyTone, toggledFilter, verdictGap } from "./series-presenters"
import { caseRow, seriesDetail } from "./test-support"

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
    expect(spendTone(seriesDetail({ spend: { usd: 0.4, capUsd: 1 } }))).toBe("neutral")
    expect(spendTone(seriesDetail({ spend: { usd: 0.85, capUsd: 1 } }))).toBe("warning")
    expect(spendTone(seriesDetail({ spend: { usd: 1.2, capUsd: 1 } }))).toBe("destructive")
  })

  it("explains a missing verdict by the question and the status", () => {
    expect(verdictGap(seriesDetail({ question: { kind: "look" }, status: "waiting_human" }))).toBe("look")
    expect(verdictGap(seriesDetail({ status: "running" }))).toBe("pending")
    expect(verdictGap(seriesDetail({ status: "done" }))).toBe("none")
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
