import { describe, expect, it } from "vitest"
import { createTranslator } from "use-intl"
import type { RunMetrics } from "@/domain"
import { rowId } from "@/data/ids"
import { messages } from "@/i18n/messages"
import { metricCards } from "./metrics"

const t = createTranslator({ locale: "en", messages: messages.en, namespace: "dataflow" })

const DEGRADED_RUN: RunMetrics = {
  cost: { valueUsd: 0.4187, previousUsd: 0.3102, overEstimateUsd: 0.11 },
  time: { valueS: 18.42, medianS: 16.3, medianRuns: 12, traceGapS: 1.4 },
  tokens: { total: 34218, growth: 1.4, discarded: 9104, input: 21402, output: 12816 },
  assertions: { passed: 44, total: 48, failedRows: ["07", "19", "33", "41"].map(rowId), failureNote: "all on the empty third hook" },
}

const CLEAN_RUN: RunMetrics = {
  cost: { valueUsd: 0.124, previousUsd: 0.131, overEstimateUsd: 0 },
  time: { valueS: 9.6, medianS: 9.9, medianRuns: 8, traceGapS: 0 },
  tokens: { total: 9551, growth: 1, discarded: 2452, input: 6800, output: 2751 },
  assertions: { passed: 24, total: 24, failedRows: [], failureNote: "" },
}

describe("metricCards", () => {
  it("renders the degraded run cards verbatim", () => {
    expect(metricCards(DEGRADED_RUN, t)).toEqual([
      {
        id: "cost",
        label: "Run cost",
        badge: { tone: "destructive", arrow: "up", children: "35 %" },
        value: "$0.4187",
        note: "$0.11 over estimate",
        hint: "including discarded branches and retries",
      },
      {
        id: "time",
        label: "Time",
        badge: { tone: "warning", arrow: "up", children: "2.1 s" },
        value: "18.42 s",
        note: "Median over 12 runs 16.3 s",
        hint: "trace gap 1.4 s between stages",
      },
      {
        id: "tokens",
        label: "Tokens",
        badge: { tone: "neutral", fill: "outline", arrow: "up", children: "×1.4" },
        value: "34,218",
        note: "9,104 went to discarded branches",
        hint: "input 21,402 · output 12,816",
      },
      {
        id: "assertions",
        label: "Assertions",
        badge: { tone: "destructive", children: "4 FAIL" },
        value: "44 / 48",
        note: "Rows 07, 19, 33, 41 failed",
        hint: "all on the empty third hook",
      },
    ])
  })

  it("derives falling deltas, flat growth and a clean run", () => {
    const [cost, time, tokens, assertions] = metricCards(CLEAN_RUN, t)
    expect(cost).toMatchObject({ badge: { tone: "success", arrow: "down", children: "5 %" }, note: "within estimate" })
    expect(time).toMatchObject({ badge: { tone: "success", arrow: "down", children: "0.3 s" }, hint: "no trace gaps between stages" })
    expect(tokens?.badge).toEqual({ tone: "neutral", fill: "outline", children: "×1.0" })
    expect(assertions).toMatchObject({ badge: { tone: "success", children: "PASS" }, value: "24 / 24", note: "All rows passed" })
  })
})
