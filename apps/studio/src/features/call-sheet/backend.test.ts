import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { createTranslator } from "use-intl"
import { CALL_SHEET_TABS, type CallColumn, type CallDetail, type DataflowRun, type MatrixGroup, type RowTrace, type StageRun } from "@/domain"
import { callId, columnId, isoDateTime, nodeId, rowId, runId, stageId } from "@/data/ids"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { callDetails, deriveCallDetails } from "@/mocks/data/calls"
import { dataflowRuns } from "@/mocks/data/dataflow"
import { rowTraces, testDetails } from "@/mocks/data/test-detail"
import { CALL_SHEET_SECTIONS } from "./sections"

type OpenableCall = { readonly key: string; readonly column: CallColumn }

const SCOPE_SEGMENTS = 2

const scopeOf = (key: string): string => key.split("/").slice(0, SCOPE_SEGMENTS).join("/")

const groupColumns = (group: MatrixGroup): readonly CallColumn[] =>
  group.columns.flatMap((column) => [column, ...(column.child === undefined ? [] : groupColumns(column.child.block.group))])

const openableCalls = (key: string, stages: readonly StageRun[]): readonly OpenableCall[] =>
  stages.flatMap((stage) => stage.groups.flatMap(groupColumns)).map((column) => ({ key: `${scopeOf(key)}/${column.callId}`, column }))

const everyOpenableCall: readonly OpenableCall[] = [
  ...Object.entries(dataflowRuns).flatMap(([key, run]) => openableCalls(key, run.stages)),
  ...Object.entries(rowTraces).flatMap(([key, trace]) => openableCalls(key, trace.steps)),
]

describe("call details in the mock backend", () => {
  it("keeps the designed call verbatim", () => {
    const detail = callDetails["hotel_pitch/pitch_pipeline/call_01HT9"]
    expect(detail?.nodeId).toBe("pitch_gen_b")
    expect(detail?.model.model).toBe("claude-sonnet-4.5")
    expect(detail?.attempts).toBe(4)
    expect(detail?.totalCostUsd).toBe(0.0611)
  })

  it("serves a detail for every call a dataflow or trace cell opens", () => {
    const missing = everyOpenableCall.filter((call) => callDetails[call.key] === undefined).map((call) => call.key)
    expect(missing).toEqual([])
  })

  it("carries the node and kind of the cell that opens it", () => {
    const mismatched = everyOpenableCall
      .filter((call) => call.column.callId !== "call_01HT9")
      .filter((call) => {
        const detail = callDetails[call.key]
        const columnNode: string = call.column.nodeId ?? call.column.id
        return detail?.nodeId !== columnNode || (call.column.kind !== undefined && detail.kind !== call.column.kind)
      })
      .map((call) => call.key)
    expect(mismatched).toEqual([])
  })

  it("keys every detail by its own call id", () => {
    const misplaced = Object.entries(callDetails).filter(([key, detail]) => !key.endsWith(`/${detail.id}`))
    expect(misplaced).toEqual([])
  })
})

const pitchRefs = [
  { provenance: "generated", label: "ranked·3", value: "rank_hotels" },
  { provenance: "knowledge", label: "tone·4", value: "brand_voice v3" },
  { provenance: "data", label: "facts", value: "load_hotels" },
  { provenance: "human", label: "brief_extra", value: "@lead" },
] as const

const toolColumn: CallColumn = {
  id: columnId("load_hotels"),
  callId: callId("call_load"),
  name: "load_hotels",
  kind: "tool",
  status: "ok",
  agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: 1.9 },
  output: { kind: "lines", lines: [["Hotel[] · 10 items"], ["[0] “Rodina Grand Hotel & Spa”"]] },
}

const judgeColumn: CallColumn = {
  id: columnId("judge_facts"),
  callId: callId("call_judge"),
  name: "judge_facts",
  status: "ok",
  output: { kind: "verdict", verdict: "approved", score: 0.84 },
}

const pitchA: CallColumn = {
  id: columnId("pitch_gen_a"),
  callId: callId("call_pitch_a"),
  name: "pitch_gen_a",
  kind: "llm",
  status: "ok",
  agent: {
    title: { kind: "model", family: "anthropic", model: "sonnet-4.5" },
    costUsd: 0.0214,
    durationS: 2.6,
    tokens: { input: 2104, output: 684 },
    config: { agent: "pitch_gen_a", temperature: 0.9, reasoning: "medium" },
  },
  prompt: [["pitch_v7 · 6 slots"], ["$persona = “premium”"]],
  output: { kind: "lines", lines: [["“Sea breeze and quiet”"]] },
  check: { score: { value: 0.71, judges: [0.83, 0.52, 0.78] }, note: { text: "facts: unsupported superlative", pass: false } },
}

const pitchC: CallColumn = {
  id: columnId("pitch_gen_c"),
  callId: callId("call_pitch_c"),
  name: "pitch_gen_c",
  kind: "llm",
  status: "degraded",
  agent: { title: { kind: "model", family: "google", model: "gemini-3-pro → flash" }, costUsd: 0.0611, durationS: 7.3 },
  output: { kind: "lines", lines: [["“A holiday where kids have plenty to do”"]] },
  child: {
    label: "judges",
    block: { kind: "parallel", fanOut: 1, titleParts: ["judges"], group: { id: "judges", rows: [{ key: "call" }], columns: [judgeColumn] } },
  },
}

const scoreColumn: CallColumn = {
  id: columnId("score_hotel_0"),
  callId: callId("call_score"),
  nodeId: nodeId("score_hotel"),
  name: "score_hotel[0]",
  kind: "llm",
  status: "ok",
  agent: {
    title: { kind: "model", family: "anthropic", model: "haiku-4.5" },
    costUsd: 0.0019,
    durationS: 0.31,
    tokens: { input: 812, output: 104 },
  },
  input: { kind: "refs", refs: [{ provenance: "data", label: "hotel · Hotel" }], note: "rating 4.8 · 240 m" },
  output: { kind: "lines", lines: [["value: 0.93"]] },
}

const iterationColumn: CallColumn = {
  id: columnId("iteration_1"),
  callId: callId("call_iteration"),
  nodeId: nodeId("fix_draft"),
  name: "iteration 1",
  status: "ok",
  agent: { title: { kind: "panel", families: ["anthropic"], judges: 3, fix: true }, costUsd: 0.0512, durationS: 2.1 },
  input: { kind: "text", lines: [["✦ draft·v1 ← pitch_gen_a"], ["“Sea breeze and quiet”"]] },
  prompt: [["judge_v2 ×3 · fix_v4"]],
  output: { kind: "lines", lines: [["draft·v2 — 3 factual edits"]] },
  check: { score: { value: 0.61, threshold: 0.9 } },
}

const failedTrace: CallColumn = { ...toolColumn, id: columnId("trace_tool"), callId: callId("call_trace"), status: "failed" }

const loadStage: StageRun = {
  id: stageId("data_load"),
  ordinal: 1,
  kind: "seq",
  title: "Data load",
  description: { kind: "toolCalls", count: 1 },
  costUsd: 0,
  durationS: 1.9,
  groups: [{ id: "load", rows: [{ key: "call" }], columns: [toolColumn] }],
}

const scoringStage: StageRun = {
  id: stageId("hotel_scoring"),
  ordinal: 2,
  kind: "map",
  title: "Hotel scoring",
  description: { kind: "map", concurrency: 8, source: "load_hotels.out.length" },
  costUsd: 0.0019,
  durationS: 0.31,
  groups: [
    {
      id: "hotel_scoring",
      rows: [{ key: "call" }, { key: "prompt" }],
      shared: { prompt: [["score_v3 · 2 slots: ", { text: "$hotel", mark: "data" }, " ", { text: "$criteria", mark: "static" }]] },
      columns: [scoreColumn],
    },
  ],
}

const loopStage: StageRun = {
  id: stageId("critic_loop"),
  ordinal: 5,
  kind: "loop",
  title: "Critic loop",
  description: { kind: "loop", body: "judge_panel + fix_draft", exit: { kind: "stagnation" } },
  costUsd: 0.0512,
  durationS: 2.1,
  groups: [{ id: "critic_loop", rows: [{ key: "call" }, { key: "input" }], columns: [iterationColumn] }],
}

const divergenceStage: StageRun = {
  id: stageId("pitch_divergence"),
  ordinal: 4,
  kind: "diverge",
  fanOut: 2,
  title: "Pitch divergence",
  description: { kind: "families", count: 2 },
  costUsd: 0.0825,
  durationS: 7.3,
  groups: [
    {
      id: "pitch",
      rows: [{ key: "call" }, { key: "input" }],
      shared: { input: { kind: "refs", refs: pitchRefs } },
      columns: [pitchA, pitchC],
    },
  ],
  attempts: {
    columnId: columnId("pitch_gen_c"),
    callLabel: "pitch_gen_c",
    chain: "429 → fallback",
    billedUsd: 0.0611,
    failedUsd: 0.01,
    attempts: [
      { n: 1, durationS: 0, outcome: "429", link: "retry", tokens: { input: 0, output: 0 }, costUsd: 0, result: "failed" },
      { n: 2, durationS: 2.4, outcome: "ok / DEGRADED", link: "fallback", tokens: { input: 2104, output: 902 }, costUsd: 0.011, result: "degraded" },
    ],
  },
}

const syntheticRun: DataflowRun = {
  run: {
    id: runId("9001"),
    status: "degraded",
    origin: { kind: "baseline" },
    costUsd: 0.0825,
    durationS: 9.2,
    assertions: { passed: 1, total: 2 },
    startedAt: isoDateTime("2026-09-16T10:00:00Z"),
  },
  metrics: {
    cost: { valueUsd: 0.0825, previousUsd: 0.08, overEstimateUsd: 0 },
    time: { valueS: 9.2, medianS: 9, medianRuns: 3, traceGapS: 0 },
    tokens: { total: 3790, growth: 1, discarded: 0, input: 2104, output: 1686 },
    assertions: { passed: 1, total: 2, failedRows: [rowId("19")], failureNote: "" },
  },
  stages: [loadStage, scoringStage, divergenceStage, loopStage],
  outcome: { status: "degraded", billedUsd: 0.0825 },
  defaultOpen: [],
}

const syntheticTrace: RowTrace = {
  rowId: rowId("12"),
  steps: [{ ...loadStage, groups: [{ id: "trace", rows: [{ key: "call" }], columns: [failedTrace] }] }],
  outcome: { verdict: "fail", failedAssertion: "hooks[*] non-empty", branch: "main", totalCostUsd: 0, calls: 1 },
}

const derived = deriveCallDetails({
  dataflowRuns: { "hotel_pitch/pitch_pipeline/9001": syntheticRun },
  rowTraces: { "hotel_pitch/pitch_pipeline/pitch_gen_b/12": syntheticTrace },
  runLists: { "hotel_pitch/pitch_pipeline": [syntheticRun.run] },
  testDetails,
})

const derivedCall = (id: string): CallDetail => {
  const detail = derived[`hotel_pitch/pitch_pipeline/${id}`]
  if (detail === undefined) throw new Error(`no derived detail for ${id}`)
  return detail
}

describe("deriveCallDetails", () => {
  it("derives a detail for every column, nested ones included", () => {
    expect(Object.keys(derived).sort()).toEqual(
      ["call_iteration", "call_judge", "call_load", "call_pitch_a", "call_pitch_c", "call_score", "call_trace"].map(
        (id) => `hotel_pitch/pitch_pipeline/${id}`,
      ),
    )
  })

  it("describes a deterministic tool call without a model or a prompt", () => {
    const detail = derivedCall("call_load")
    expect([detail.kind, detail.branch, detail.stage, detail.row, detail.runId]).toEqual(["tool", "main", 1, "19", "9001"])
    expect(detail.model.provider).toBe("none · not a model call")
    expect(detail.totalCostUsd).toBe(0)
    expect([detail.prompt.template.text, detail.prompt.system, detail.prompt.user.text]).toEqual(["", "", ""])
    expect(detail.input.slots).toEqual([])
    expect(detail.checks.history.dataset).toBe("pitch_golden_v4")
  })

  it("carries model, family, tokens, judges and lineage of a branch call", () => {
    const detail = derivedCall("call_pitch_a")
    expect([detail.nodeId, detail.branch, detail.stage, detail.model.provider, detail.model.model]).toEqual([
      "pitch_gen_a",
      "a",
      4,
      "Anthropic (direct)",
      "sonnet-4.5",
    ])
    expect([detail.billing.inputTokens, detail.billing.outputTokens, detail.params.temperature]).toEqual([2104, 684, 0.9])
    expect(detail.routing.order).toEqual(["sonnet-4.5", "haiku-4.5"])
    expect(detail.routing.profile).toBe("pitch_writer")
    expect(detail.input.slots).toEqual([
      { provenance: "static", label: "persona", value: "“premium”" },
      { provenance: "generated", label: "ranked", value: "$rank_hotels.out" },
      { provenance: "knowledge", label: "tone", value: "brand_voice v3" },
      { provenance: "data", label: "facts", value: "$load_hotels.out" },
      { provenance: "human", label: "brief_extra", value: "@lead" },
    ])
    expect(detail.input.freeze).toEqual([
      { kind: "recorded", node: "rank_hotels", fromRun: "9001" },
      { kind: "knowledge", value: "brand_voice v3 · draft r42" },
      { kind: "recorded", node: "load_hotels", fromRun: "9001" },
    ])
    expect(detail.prompt.template.id).toBe("pitch_v7")
    expect(detail.prompt.diff).toHaveLength(2)
    expect(detail.checks.judges.votes.map((vote) => [vote.node, vote.score])).toEqual([
      ["judge_style", 0.83],
      ["judge_facts", 0.52],
      ["judge_tone", 0.78],
    ])
    expect(detail.checks.judges.decision).toEqual({ verdict: "approved", passed: 2, total: 3 })
  })

  it("builds the template from slot paths and compiles it from upstream outputs", () => {
    const detail = derivedCall("call_pitch_a")
    expect(detail.prompt.template.text).toBe(
      ["Persona:", "$persona", "", "Ranked:", "$ranked", "", "Tone:", "$tone", "", "Facts:", "$facts", "", "Brief extra:", "$brief_extra"].join("\n"),
    )
    expect(detail.prompt.user.text).toBe(
      [
        "Persona:",
        "“premium”",
        "",
        "Ranked:",
        "$rank_hotels.out",
        "",
        "Tone:",
        "brand_voice v3",
        "",
        "Facts:",
        "Hotel[] · 10 items",
        "[0] “Rodina Grand Hotel & Spa”",
        "",
        "Brief extra:",
        "@lead",
      ].join("\n"),
    )
  })

  it("turns a facts remark into a failing assertion and a failing history entry", () => {
    const detail = derivedCall("call_pitch_a")
    expect(detail.checks.assertions.filter((check) => !check.pass)).toEqual([{ name: "every number exists in facts", pass: false }])
    expect(detail.checks.history.entries.at(-1)).toEqual({ revision: "r42", draft: true, verdict: "fail", note: "facts: unsupported superlative" })
    expect(detail.output.comparison.factual).toBe(detail.output.comparison.semantic)
  })

  it("names a map call by its node and routes it through the node profile", () => {
    const detail = derivedCall("call_score")
    expect([detail.nodeId, detail.routing.profile]).toEqual(["score_hotel", "scorer_fast"])
    expect(detail.routing.order).toEqual(["haiku-4.5", "sonnet-4.5"])
    expect(detail.input.slots).toEqual([
      { provenance: "data", label: "hotel", value: "Hotel" },
      { provenance: "static", label: "criteria", value: "from the score_v3 template" },
    ])
    expect(detail.input.freeze).toEqual([])
    expect(detail.prompt.template.text).toBe(["Hotel:", "$hotel", "", "Criteria:", "$criteria"].join("\n"))
    expect(detail.prompt.user.text).toBe(["Hotel:", "rating 4.8 · 240 m", "", "Criteria:", "from the score_v3 template"].join("\n"))
  })

  it("maps provenance chips of a text input into slots", () => {
    const detail = derivedCall("call_iteration")
    expect(detail.nodeId).toBe("fix_draft")
    expect(detail.input.slots).toEqual([{ provenance: "generated", label: "draft", value: "$pitch_gen_a.out" }])
    expect(detail.input.rowValues).toEqual(["“Sea breeze and quiet”"])
    expect(detail.input.freeze).toEqual([{ kind: "recorded", node: "pitch_gen_a", fromRun: "9001" }])
    expect(detail.prompt.template.id).toBe("judge_v2")
    expect(detail.prompt.user.text).toBe(["Draft:", "“Sea breeze and quiet”"].join("\n"))
  })

  it("fails a loop iteration that stays below the score threshold", () => {
    const detail = derivedCall("call_iteration")
    expect(detail.checks.assertions.filter((check) => !check.pass)).toEqual([{ name: "score reaches the 0.90 threshold", pass: false }])
    expect(detail.checks.history.entries.at(-1)).toEqual({ revision: "r42", draft: true, verdict: "fail", note: "score 0.61 below the 0.90 threshold" })
  })

  it("keeps the post-check verdict of every served call in its history", () => {
    const contradicting = Object.values(callDetails)
      .filter((detail) => detail.id !== "call_01HT9")
      .filter(({ checks }) => checks.assertions.every((check) => check.pass) !== (checks.history.entries.at(-1)?.verdict === "pass"))
      .map((detail) => detail.id)
    expect(contradicting).toEqual([])
  })

  it("names the agent in the system prompt and leaves out an unknown call duration", () => {
    expect(derivedCall("call_pitch_a").prompt.system).toMatch(/^You are the pitch_gen_a agent of the pitch_pipeline workflow\./)
    expect(derivedCall("call_judge").routing.cassette).toBe("none · live call")
    expect(derivedCall("call_score").routing.cassette).toBe("none · live call · 0.31 s")
  })

  it("prices tokens so that they add up to the billed attempt", () => {
    const priced = Object.values(derived).filter((detail) => detail.billing.inputTokens > 0)
    const mismatched = priced.filter(({ billing }) => {
      const billed = (billing.inputTokens * billing.pricePer1k.inputUsd + billing.outputTokens * billing.pricePer1k.outputUsd) / 1000
      return Math.abs(billed - billing.attemptCostUsd) > 0.0001
    })
    expect(priced.length).toBeGreaterThan(0)
    expect(mismatched.map((detail) => detail.id)).toEqual([])
  })

  it("bills the attempts ladder and the fallback of a degraded call", () => {
    const detail = derivedCall("call_pitch_c")
    expect([detail.attempt, detail.attempts, detail.totalCostUsd]).toEqual([2, 2, 0.0611])
    expect([detail.billing.attemptCostUsd, detail.billing.failedAttemptsCostUsd]).toEqual([0.011, 0.01])
    expect([detail.billing.inputTokens, detail.billing.outputTokens]).toEqual([2104, 902])
    expect(detail.routing.order).toEqual(["gemini-3-pro", "gemini-3-flash"])
    expect(detail.routing.fallbackReason).toBe("429 · rate limit")
    expect(derivedCall("call_judge").branch).toBe("c")
    expect(derivedCall("call_judge").kind).toBe("llm")
  })

  it("places trace calls on their row and the latest run", () => {
    const detail = derivedCall("call_trace")
    expect([detail.row, detail.runId]).toEqual(["12", "9001"])
    expect(detail.output.validationErrors).toHaveLength(1)
    expect(detail.checks.assertions.some((check) => !check.pass)).toBe(true)
    expect(detail.checks.history.entries.at(-1)?.verdict).toBe("fail")
  })

  it("presents every derived call on every tab without blank values", () => {
    const t = createTranslator({ locale: "en", messages: messages.en, formats })
    const tags = { b: (chunks: ReactNode) => chunks, v: (chunks: ReactNode) => chunks, code: (chunks: ReactNode) => chunks }
    const values = Object.values(derived).flatMap((detail) =>
      CALL_SHEET_TABS.flatMap((tab) =>
        CALL_SHEET_SECTIONS[tab](detail, { t, tags }).flatMap((section) =>
          section.body.kind === "properties" ? section.body.rows.map((row) => row.value) : [],
        ),
      ),
    )
    expect(values.length).toBeGreaterThan(0)
    expect(values).not.toContain("")
  })
})
