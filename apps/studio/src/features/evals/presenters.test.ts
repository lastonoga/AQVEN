import { describe, expect, it } from "vitest"
import { EVAL_RUN_ID, liveDatasets, liveEvalCases, liveEvalRuns, liveEvals } from "@/mocks/data/evals"
import {
  CASE_TONE,
  caseKey,
  costText,
  durationText,
  EVAL_RUN_TONE,
  evalRef,
  GATE_TONE,
  gateNumber,
  isCase,
  latencyText,
  meanText,
  outputText,
  passRateText,
  rangeText,
  scorerMeansText,
  scoresText,
  splitsText,
  targetText,
  tokensText,
  usedByText,
} from "./presenters"

const NONE = "—"

const evalItem = liveEvals[0]
const dataset = liveDatasets.find((item) => item.dataset_id === "reply_cases")
const run = liveEvalRuns[0]
const cases = liveEvalCases[EVAL_RUN_ID] ?? []

describe("eval summaries", () => {
  it("reads the target of the lumen eval from the engine", () => {
    expect(evalItem?.eval_id).toBe("reply_quality")
    expect(evalItem === undefined ? "" : targetText(evalItem)).toBe("revise · gpt")
  })

  it("counts the cases of a dataset by split and names its readers", () => {
    expect(dataset === undefined ? "" : splitsText(dataset, NONE)).toBe("train 1 · dev 1 · test 1")
    expect(dataset === undefined ? "" : usedByText(dataset, NONE)).toBe("reply_quality")
  })
})

describe("eval runs", () => {
  it("names a run by the tail of its id", () => {
    expect(evalRef(EVAL_RUN_ID)).toBe("#f16784")
  })

  it("says how long a finished run took", () => {
    expect(run === undefined ? "" : durationText(run.started_at, run.finished_at)).toBe("745 ms")
    expect(durationText("2026-09-17T21:57:10Z", null)).toBeNull()
  })

  it("leaves the scorer means out when the run scored nothing", () => {
    expect(run === undefined ? "" : scorerMeansText(run, NONE)).toBe(NONE)
    const scorer = run?.scorers[0]
    expect(scorer === undefined ? "" : meanText(scorer, NONE)).toBe(NONE)
    expect(scorer === undefined ? "" : rangeText(scorer, NONE)).toBe(NONE)
    expect(scorer === undefined ? "" : passRateText(scorer, NONE)).toBe(NONE)
  })

  it("formats the cost and the tokens the engine reports as strings", () => {
    expect(run === undefined ? "" : costText(run.cost_usd)).toBe("$0.0000")
    expect(costText("not a number")).toBe("$0.0000")
    expect(tokensText(1200, 340)).toBe("1,200 / 340")
  })

  it("tones a status and a gate decision", () => {
    expect(EVAL_RUN_TONE.failed).toBe("destructive")
    expect(CASE_TONE.ok).toBe("success")
    expect(GATE_TONE.BLOCK).toBe("destructive")
    expect(gateNumber(null, NONE)).toBe(NONE)
  })
})

describe("cases of a run", () => {
  it("keys a case by its name and its repeat", () => {
    const first = cases[0]
    expect(first === undefined ? "" : caseKey(first)).toBe("bulb_app_offline_advice#0")
    expect(cases.filter((row) => isCase(row, "strip_flicker_credit", null))).toHaveLength(3)
    expect(cases.filter((row) => isCase(row, "strip_flicker_credit", 2))).toHaveLength(1)
    expect(cases.filter((row) => isCase(row, null, null))).toHaveLength(0)
  })

  it("has no scores and no output to show for a case that never ran", () => {
    const first = cases[0]
    expect(first === undefined ? "" : scoresText(first, NONE)).toBe(NONE)
    expect(first === undefined ? null : outputText(first.output)).toBeNull()
    expect(outputText({ reply: "ok" })).toBe('{\n  "reply": "ok"\n}')
  })

  it("reads a latency in milliseconds below a second and in seconds above", () => {
    expect(latencyText(97)).toBe("97 ms")
    expect(latencyText(1500)).toBe("1.5 s")
  })
})
