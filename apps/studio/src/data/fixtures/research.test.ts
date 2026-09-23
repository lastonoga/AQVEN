import { describe, expect, it } from "vitest"
import type { ExperimentDetail, MetricCell, SeriesDetail, SeriesSummary } from "@/domain"
import { QUESTION_KINDS, SERIES_STATUSES, SUBJECT_KINDS, VERDICT_STATES } from "@/domain"
import * as ids from "@/data/ids"
import { isNotFound } from "@/api/client"
import { researchSource } from "@/data/live/research"
import { createResearchStore, FORM_WAIT_RUN, RESEARCH_FIXTURE_SERIES } from "./research"

const FIXED_NOW = new Date("2026-09-23T10:00:00Z")

const freshStore = () => createResearchStore(() => FIXED_NOW)

const allSeries = (store: ReturnType<typeof createResearchStore>): readonly SeriesSummary[] =>
  store.experiments({}).flatMap((experiment) => store.seriesOfExperiment(experiment.id) ?? [])

const requireSeries = (store: ReturnType<typeof createResearchStore>, id: SeriesSummary["id"]): SeriesDetail => {
  const detail = store.series(id)
  if (detail === null) throw new Error(`missing series ${id}`)
  return detail
}

const requireExperiment = (store: ReturnType<typeof createResearchStore>, id: string): ExperimentDetail => {
  const detail = store.experiment(ids.experimentId(id))
  if (detail === null) throw new Error(`missing experiment ${id}`)
  return detail
}

const cells = (detail: SeriesDetail): readonly MetricCell[] => detail.matrix.rows.flatMap((row) => row.cells)

const everySeries = (store: ReturnType<typeof createResearchStore>): readonly SeriesDetail[] =>
  Object.values(RESEARCH_FIXTURE_SERIES).map((id) => requireSeries(store, id))

describe("research fixtures", () => {
  it("builds the lumen experiments covering every question and subject kind", () => {
    const experiments = freshStore().experiments({})
    expect(experiments).toHaveLength(8)
    expect(new Set(experiments.map((item) => item.question))).toEqual(new Set(QUESTION_KINDS))
    expect(new Set(experiments.map((item) => item.subject.kind))).toEqual(new Set(SUBJECT_KINDS))
  })

  it("covers every series status and verdict state", () => {
    const store = freshStore()
    const series = everySeries(store)
    expect(new Set(series.map((item) => item.status))).toEqual(new Set(SERIES_STATUSES))
    expect(new Set(series.flatMap((item) => (item.verdict === null ? [] : [item.verdict.state])))).toEqual(new Set(VERDICT_STATES))
  })

  it("pins the verdict of each settled series", () => {
    const store = freshStore()
    const state = (id: SeriesSummary["id"]) => requireSeries(store, id).verdict?.state ?? null
    expect(state(RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout)).toBe("confirmed")
    expect(state(RESEARCH_FIXTURE_SERIES.replyNoninferiorDev)).toBe("signal")
    expect(state(RESEARCH_FIXTURE_SERIES.intentSplitHoldout)).toBe("inconclusive")
    expect(state(RESEARCH_FIXTURE_SERIES.panelAgentsHoldout)).toBe("refuted")
    expect(state(RESEARCH_FIXTURE_SERIES.singleJudgeFailed)).toBe("invalid")
    expect(state(RESEARCH_FIXTURE_SERIES.overpromiseAwaiting)).toBeNull()
    expect(state(RESEARCH_FIXTURE_SERIES.lookWaiting)).toBeNull()
  })

  it("keeps every interval around its value", () => {
    const store = freshStore()
    const measured = everySeries(store).flatMap(cells).filter((cell) => cell.value !== null)
    expect(measured.length).toBeGreaterThan(100)
    measured.forEach((cell) => {
      expect(cell.ciLow ?? Number.NaN).toBeLessThanOrEqual((cell.value ?? 0) + 1e-9)
      expect(cell.ciHigh ?? Number.NaN).toBeGreaterThanOrEqual((cell.value ?? 0) - 1e-9)
    })
  })

  it("adds up the spend of a series from its attempts", () => {
    const store = freshStore()
    everySeries(store).forEach((detail) => {
      const rows = store.seriesCases(detail.id, {}) ?? []
      const attempts = rows.flatMap((row) => row.attempts).filter((attempt) => attempt.outcome !== "waiting")
      expect(attempts).toHaveLength(detail.progress.done)
      expect(detail.spend.usd).toBeCloseTo(attempts.reduce((total, attempt) => total + attempt.usd, 0), 3)
      expect(detail.progress.total).toBe(detail.cases * detail.repeats * detail.variants.length)
    })
  })

  it("rolls the series of an experiment into its summary", () => {
    const store = freshStore()
    const summary = store.experiments({}).find((item) => item.id === "reply_noninferior_mistral")
    const series = store.seriesOfExperiment(ids.experimentId("reply_noninferior_mistral")) ?? []
    expect(summary?.seriesCount).toBe(2)
    expect(summary?.latest?.id).toBe(RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout)
    expect(summary?.spentUsd).toBeCloseTo(series.reduce((total, item) => total + item.spend.usd, 0), 4)
    expect(summary?.baseline).toBe("gpt")
    expect(summary?.candidate).toBe("mistral")
  })

  it("describes the experiment from its files", () => {
    const store = freshStore()
    const detail = requireExperiment(store, "reply_noninferior_mistral")
    expect(detail.files).toEqual({ spec: "experiments/reply_noninferior_mistral/experiment.yaml", notes: "experiments/reply_noninferior_mistral/experiment.md" })
    expect(detail.notes).toContain("# mistral in the revision step")
    expect(detail.cases).toEqual({ dataset: "support_case_cases", flow: "support_case", tags: {}, selected: 12, total: 12 })
    expect(detail.variants.map((item) => [item.id, item.assignments.map((assignment) => `${assignment.node}:${assignment.agent.id}:${assignment.agent.model}`)])).toEqual([
      ["gpt", ["polish__revise:gpt:openrouter:openai/gpt-oss-20b"]],
      ["mistral", ["polish__revise:mistral:openrouter:mistralai/mistral-nemo"]],
    ])
    expect(detail.metrics.slice(0, 3).map((item) => [item.id, item.role])).toEqual([
      ["critique", "primary"],
      ["cost_of_pass", "guardrail"],
      ["promises", "check"],
    ])
    expect(requireExperiment(store, "reply_look").cases).toMatchObject({ tags: { regression: "yes" }, selected: 5, total: 12 })
  })

  it("filters the experiments by flow, question and failure mode", () => {
    const store = freshStore()
    expect(store.experiments({ flow: ids.flowId("judge_panel") }).map((item) => item.id)).toEqual(["judge_panel_agents", "panel_single_judge"])
    expect(store.experiments({ question: "threshold" }).map((item) => item.id)).toEqual(["critique_planted_defects", "reply_overpromise_risk"])
    expect(store.experiments({ failureMode: "intent_misread" }).map((item) => item.id)).toEqual(["intent_split_long_messages", "intent_escalation_agents"])
  })

  it("estimates a launch and recommends a larger N with its reason", () => {
    const store = freshStore()
    const estimate = store.estimate(ids.experimentId("reply_noninferior_mistral"), { on: "dev", cases: 12, repeats: 3 })
    expect(estimate).toMatchObject({ attempts: 72, variants: 2, available: 12, margin: 0.05, belowRecommended: true, needsApproval: false })
    expect(estimate?.recommended.reason).toBe("wide")
    expect(estimate?.recommended.cases).toBeGreaterThan(50)
    expect(estimate?.usd).toBeCloseTo(72 * ((0.0135 + 0.0118) / 2), 4)
    expect(store.estimate(ids.experimentId("reply_look"), { on: "dev", cases: 5, repeats: 1 })).toMatchObject({ halfWidth: null, recommended: { cases: 5, reason: "look" } })
  })

  it("starts, approves and cancels a series", () => {
    const store = freshStore()
    const started = store.startSeries(ids.experimentId("reply_overpromise_risk"), { on: "holdout", cases: 12, repeats: 20 })
    if (started === null) throw new Error("series did not start")
    expect(requireSeries(store, started)).toMatchObject({ status: "awaiting_approval", progress: { done: 0, total: 240 }, startedAt: FIXED_NOW.toISOString() })
    expect(store.approveSeries(started)?.status).toBe("running")
    expect(store.cancelSeries(started)).toMatchObject({ status: "cancelled", finishedAt: FIXED_NOW.toISOString() })
    expect(store.approveSeries(started)?.status).toBe("cancelled")
    const cheap = store.startSeries(ids.experimentId("critique_planted_defects"), { on: "dev", cases: 4, repeats: 1 })
    expect(cheap === null ? null : requireSeries(store, cheap).status).toBe("running")
    store.reset()
    expect(store.series(started)).toBeNull()
  })

  it("returns a finished look series for the cases picked on the cases tab", () => {
    const store = freshStore()
    const id = store.startLook(ids.flowId("support_case"), ids.datasetId("support_case_cases"), ["nova_runtime_advice", "dimmer_buzz_advice", "unknown_case"])
    if (id === null) throw new Error("look did not start")
    const detail = requireSeries(store, id)
    expect(detail).toMatchObject({ status: "done", cases: 2, repeats: 1, verdict: null, origin: { kind: "look", cases: ["nova_runtime_advice", "dimmer_buzz_advice"] } })
    expect((store.seriesCases(id, {}) ?? []).map((row) => row.name)).toEqual(["nova_runtime_advice", "dimmer_buzz_advice"])
  })

  it("lists the case rows with k of n per variant, filters and the waiting runs", () => {
    const store = freshStore()
    const rows = store.seriesCases(RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout, {}) ?? []
    expect(rows).toHaveLength(12)
    rows.forEach((row) => {
      expect(row.variants.map((tally) => tally.total)).toEqual([3, 3])
      expect(row.attempts).toHaveLength(6)
    })
    const failing = store.seriesCases(RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout, { failures: true }) ?? []
    expect(failing.length).toBeGreaterThan(0)
    expect(failing.every((row) => row.failing)).toBe(true)
    const divergent = store.seriesCases(RESEARCH_FIXTURE_SERIES.replyNoninferiorHoldout, { divergent: true }) ?? []
    expect(divergent.every((row) => row.divergent)).toBe(true)
    const waiting = store.seriesCases(RESEARCH_FIXTURE_SERIES.lookWaiting, {}) ?? []
    expect(waiting.flatMap((row) => row.attempts).filter((attempt) => attempt.outcome === "waiting").map((attempt) => attempt.run)).toContain(FORM_WAIT_RUN)
    expect(requireSeries(store, RESEARCH_FIXTURE_SERIES.lookWaiting).waits).toBe(2)
  })
})

describe("research source", () => {
  it("rejects a missing experiment or series with a not found error", async () => {
    const source = researchSource(freshStore())
    await expect(source.experiment(ids.experimentId("nope"))).rejects.toSatisfy(isNotFound)
    await expect(source.series(ids.seriesId("nope"))).rejects.toSatisfy(isNotFound)
  })

  it("rejects an empty look and an invalid launch", async () => {
    const source = researchSource(freshStore())
    await expect(source.startLook(ids.flowId("support_case"), ids.datasetId("support_case_cases"), [])).rejects.toMatchObject({ status: 422 })
    await expect(source.estimate(ids.experimentId("reply_look"), { on: "dev", cases: 0, repeats: 1 })).rejects.toMatchObject({ status: 422 })
  })

  it("serves every series of the fixtures", async () => {
    const store = freshStore()
    const source = researchSource(store)
    const listed = allSeries(store)
    expect(listed.length).toBe(9)
    await expect(source.series(RESEARCH_FIXTURE_SERIES.lookWaiting)).resolves.toMatchObject({ status: "waiting_human", flow: "support_case" })
  })
})
