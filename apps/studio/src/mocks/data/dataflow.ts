import type {
  AgentCell,
  AgentTitle,
  AttemptLadder,
  CallColumn,
  CallId,
  CheckCell,
  ClaimVerdict,
  ColumnPath,
  ContentPart,
  DataflowRun,
  InputCell,
  JudgeVerdict,
  MatrixGroup,
  NestedBlock,
  OutputCell,
  ProvenancedValue,
  Reasoning,
  RowKey,
  RowSpec,
  RunMetrics,
  RunOutcome,
  RunSummary,
  ScoreFact,
  StageKind,
  StageRun,
  TextLine,
} from "@/domain"
import { callId, columnId, columnPath, rowId } from "@/data/ids"
import { catalogNode, catalogStage, type CatalogNode } from "./catalog"
import { runLists } from "./run-list"
import { WORKFLOWS, shortCallId, workflowKey } from "./keys"

type Scale = { readonly cost: number; readonly time: number }
type Build = { readonly workflow: string; readonly run: string; readonly scale: Scale }
type ColumnFields = Omit<CallColumn, "id" | "callId" | "nodeId">
type StageFields = Omit<StageRun, "id" | "ordinal" | "title" | "costUsd" | "durationS"> & { readonly durationS?: number | null }

type Divergence = "degraded" | "clean" | "failed" | "input"
type Decision = "awaiting" | "approved"

type MetricsProfile = {
  readonly cost: Omit<RunMetrics["cost"], "valueUsd">
  readonly time: Omit<RunMetrics["time"], "valueS">
  readonly tokens: RunMetrics["tokens"]
  readonly assertions: Pick<RunMetrics["assertions"], "failedRows" | "failureNote">
}

type PitchRunProfile = {
  readonly metrics: MetricsProfile
  readonly divergence: Divergence
  readonly decision: Decision
}

type JudgeFact = { readonly score: number; readonly verdict: JudgeVerdict; readonly remark?: string }
type ClaimFact = { readonly claim: string; readonly source: string; readonly verdict: ClaimVerdict }
type JudgePanelFacts = {
  readonly draft: string
  readonly style: JudgeFact
  readonly facts: JudgeFact
  readonly tone: JudgeFact
  readonly claims: readonly ClaimFact[]
}
type LoopIteration = {
  readonly costUsd: number
  readonly durationS: number
  readonly input: ProvenancedValue
  readonly output: string
  readonly score: number
  readonly previous?: number
  readonly best?: boolean
  readonly stopped?: boolean
  readonly judges: JudgePanelFacts
}
type JudgeSpec = {
  readonly id: string
  readonly costUsd: number
  readonly durationS: number
  readonly input: string
}
type Persona = {
  readonly id: string
  readonly audience: string
  readonly costUsd: number
  readonly durationS: number
  readonly prompt: string
  readonly output: string
  readonly passed: number
  readonly note: string
  readonly iterations: readonly LoopIteration[]
}
type HotelScore = {
  readonly hotel: string
  readonly costUsd: number
  readonly durationS: number
  readonly tokens: { readonly input: number; readonly output: number } | "cassette"
  readonly note: string
  readonly value: string
  readonly remark: string
}
type PitchDraft = {
  readonly id: string
  readonly fallback?: string
  readonly subtitle: string
  readonly costUsd: number
  readonly costFactor?: number
  readonly durationS: number
  readonly tokens: { readonly input: number; readonly output: number }
  readonly prompt: readonly TextLine[]
  readonly output: OutputCell
  readonly check: CheckCell
  readonly status: "ok" | "degraded" | "failed"
  readonly selected?: boolean
}

const USD_PRECISION = 10_000
const SECONDS_PRECISION = 100
const WAVEFORM_PEAK = 40
const THRESHOLD = 0.9
const PATH_SEPARATOR = "/"
const MODEL_ARROW = " → "
const UNIT: Scale = { cost: 1, time: 1 }
const PARALLEL_KINDS: ReadonlySet<StageKind> = new Set<StageKind>(["diverge", "parallel", "map"])
const DESIGN_RUNS: ReadonlySet<string> = new Set(["8247"])

const CALL_ID_OVERRIDES: Readonly<Record<string, string>> = {
  "8247/pitch_divergence/pitch_gen_b": "call_01HT9",
}

const roundUsd = (value: number): number => Math.round(value * USD_PRECISION) / USD_PRECISION

const roundSeconds = (value: number): number => Math.round(value * SECONDS_PRECISION) / SECONDS_PRECISION

const usdOf = (build: Build, value: number): number => roundUsd(value * build.scale.cost)

const secondsOf = (build: Build, value: number): number => roundSeconds(value * build.scale.time)

const joinPath = (...parts: readonly string[]): string => parts.join(PATH_SEPARATOR)

const callFor = (build: Build, path: string): CallId => {
  const key = joinPath(build.run, path)
  return callId(CALL_ID_OVERRIDES[key] ?? shortCallId(joinPath(build.workflow, key)))
}

const nodeOf = (build: Build, id: string): CatalogNode => catalogNode(build.workflow, id)

const column = (build: Build, parent: string, id: string, fields: ColumnFields, node: string = id): CallColumn => ({
  id: columnId(id),
  callId: callFor(build, joinPath(parent, id)),
  nodeId: nodeOf(build, node).id,
  ...fields,
})

const modelTitle = (node: CatalogNode, fallback?: string): AgentTitle => ({
  kind: "model",
  family: node.model?.family ?? "anthropic",
  model: [node.model?.model ?? "", ...(fallback === undefined ? [] : [fallback])].join(MODEL_ARROW),
})

const familyOf = (node: CatalogNode): Pick<CallColumn, "family"> => (node.model === undefined ? {} : { family: node.model.family })

const modelName = (node: CatalogNode): string => node.model?.model ?? ""

const groupCost = (group: MatrixGroup): number =>
  group.summary?.totalUsd ?? group.columns.reduce((sum, item) => sum + (item.agent?.costUsd ?? 0), 0)

const groupDuration = (group: MatrixGroup, kind: StageKind): number => {
  const durations = group.columns.map((item) => item.agent?.durationS ?? 0)
  if (PARALLEL_KINDS.has(group.kind ?? kind)) return Math.max(0, ...durations)
  return durations.reduce((sum, value) => sum + value, 0)
}

const stageRun = (build: Build, id: string, fields: StageFields): StageRun => {
  const stage = catalogStage(build.workflow, id)
  const { durationS, ...rest } = fields
  const computed = roundSeconds(fields.groups.reduce((sum, group) => sum + groupDuration(group, fields.kind), 0))
  return {
    id: stage.id,
    ordinal: stage.number,
    title: stage.title,
    ...rest,
    costUsd: roundUsd(fields.groups.reduce((sum, group) => sum + groupCost(group), 0)),
    durationS: durationS === undefined ? computed : durationS,
  }
}

const totalCost = (stages: readonly StageRun[]): number => stages.reduce((sum, stage) => sum + stage.costUsd, 0)

const totalDuration = (stages: readonly StageRun[]): number => stages.reduce((sum, stage) => sum + (stage.durationS ?? 0), 0)

const ratioOf = (value: number, base: number): number => (base === 0 ? 1 : value / base)

const rows = (...keys: readonly RowKey[]): readonly RowSpec[] => keys.map((key) => ({ key }))

const lines = (...texts: readonly string[]): readonly TextLine[] => texts.map((text) => [text])

const waveform = (...heights: readonly number[]): readonly number[] => heights.map((height) => height / WAVEFORM_PEAK)

const agentConfig = (agent: string, temperature = 0.9, reasoning: Reasoning = "medium"): NonNullable<AgentCell["config"]> => ({
  agent,
  temperature,
  reasoning,
})

const refs = (...values: readonly ProvenancedValue[]): InputCell => ({ kind: "refs", refs: values })

const remarkOf = (remark: string | undefined): { readonly remark?: string } => (remark === undefined ? {} : { remark })

const scoreFact = (iteration: LoopIteration): ScoreFact => ({
  value: iteration.score,
  threshold: THRESHOLD,
  ...(iteration.previous === undefined ? {} : { previous: iteration.previous }),
  ...(iteration.stopped === true ? { stopped: true } : {}),
})

const dataLoad = (build: Build): StageRun => {
  const group = "data_load"
  return stageRun(build, group, {
    kind: "seq",
    description: { kind: "toolCalls", count: 1 },
    groups: [
      {
        id: group,
        kind: "seq",
        rows: rows("call", "agent", "input", "prompt", "output"),
        columns: [
          column(build, group, "load_hotels", {
            name: "load_hotels",
            kind: "tool",
            status: "ok",
            subtitle: "hotels.search · read",
            agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: secondsOf(build, 1.9) },
            input: refs(
              { provenance: "static", label: 'city:"Sochi"' },
              { provenance: "static", label: "nights:3" },
              { provenance: "human", label: "“no nightclubs”" },
            ),
            output: {
              kind: "lines",
              lines: lines(
                "Hotel[] · 10 items",
                "[0] “Rodina Grand Hotel & Spa” · 4.8 · 240 m to beach",
                "[1] “Sea Galaxy” · 4.5 · 900 m",
                "[2] “Bridge Resort” · 4.6 · 1.4 km",
              ),
              truncated: true,
            },
          }),
        ],
      },
    ],
  })
}

const HOTEL_SCORES: readonly HotelScore[] = [
  { hotel: "Rodina", costUsd: 0.0019, durationS: 0.31, tokens: { input: 812, output: 104 }, note: "rating 4.8 · 240 m", value: "value: 0.93", remark: "“beach nearby, spa, quiet”" },
  { hotel: "Sea Galaxy", costUsd: 0.0021, durationS: 0.34, tokens: { input: 844, output: 112 }, note: "rating 4.5 · 900 m", value: "value: 0.88", remark: "“big pool, kids club”" },
  { hotel: "Bridge Resort", costUsd: 0.0018, durationS: 0.29, tokens: { input: 801, output: 98 }, note: "rating 4.6 · 1.4 km", value: "value: 0.84", remark: "“far from the sea, but a park”" },
  { hotel: "Marins", costUsd: 0, durationS: 0.02, tokens: "cassette", note: "rating 3.9 · 2.1 km", value: "value: 0.44", remark: "“noisy area, renovation”" },
]

const hotelScoreColumn = (build: Build, parent: string, score: HotelScore, index: number): CallColumn => {
  const name = `score_hotel[${String(index)}]`
  const node = nodeOf(build, "score_hotel")
  return column(
    build,
    parent,
    `score_hotel_${String(index)}`,
    {
      name,
      kind: node.kind,
      status: score.tokens === "cassette" ? "cached" : "ok",
      ...familyOf(node),
      subtitle: score.hotel,
      agent: {
        title: modelTitle(node),
        costUsd: usdOf(build, score.costUsd),
        durationS: secondsOf(build, score.durationS),
        tokens: score.tokens,
        config: agentConfig(name, 0.2, "off"),
      },
      input: { kind: "refs", refs: [{ provenance: "data", label: "hotel · Hotel" }], note: score.note },
      output: { kind: "lines", lines: lines(score.value, score.remark) },
    },
    node.id,
  )
}

const hotelScoring = (build: Build): StageRun => {
  const group = "hotel_scoring"
  return stageRun(build, group, {
    kind: "map",
    fanOut: 10,
    description: { kind: "map", concurrency: 8, source: "load_hotels.out.length" },
    durationS: secondsOf(build, 3.4),
    groups: [
      {
        id: group,
        kind: "map",
        rows: rows("call", "agent", "input", "prompt", "output"),
        columns: HOTEL_SCORES.map((score, index) => hotelScoreColumn(build, group, score, index)),
        shared: {
          prompt: [
            [
              "score_v3 · 2 slots: ",
              { text: "$hotel", mark: "data" },
              " ",
              { text: "$criteria", mark: "static" },
              " — identical across all 10 calls, only the input differs",
            ],
          ],
        },
        summary: {
          hiddenCalls: 6,
          totalUsd: usdOf(build, 0.0192),
          medianS: secondsOf(build, 0.31),
          typeName: "Hotel",
          spread: { min: 0.44, max: 0.93 },
          ok: { passed: 10, total: 10 },
        },
      },
    ],
  })
}

const scoreReduce = (build: Build): StageRun => {
  const group = "score_reduce"
  return stageRun(build, group, {
    kind: "seq",
    description: { kind: "pureFunction" },
    groups: [
      {
        id: group,
        kind: "seq",
        rows: rows("call", "agent", "input", "prompt", "output"),
        columns: [
          column(build, group, "rank_hotels", {
            name: "rank_hotels",
            kind: "fn",
            status: "ok",
            subtitle: "pure",
            agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: secondsOf(build, 0.04) },
            input: { kind: "refs", refs: [{ provenance: "generated", label: "scores · Score[]·10" }], note: "← score_hotel[0…9]" },
            output: { kind: "lines", lines: lines("Ranked · 10 → top 3", "Rodina 0.93 · Sea Galaxy 0.88 · Bridge 0.84") },
          }),
        ],
      },
    ],
  })
}

const PITCH_GEN_A: PitchDraft = {
  id: "pitch_gen_a",
  subtitle: "“premium”",
  costUsd: 0.0214,
  durationS: 2.6,
  tokens: { input: 2104, output: 684 },
  prompt: lines("pitch_v7 · 6 slots", "$persona = “premium”"),
  output: {
    kind: "lines",
    lines: [["“Sea breeze and quiet”"], ["· spa and terrace"], ["· sea view"], ["· ", { text: "“best hotel in town”", mark: "issue" }]],
    truncated: true,
  },
  check: { score: { value: 0.71, judges: [0.83, 0.52, 0.78] }, note: { text: "facts: unsupported superlative", pass: false } },
  status: "ok",
}

const PITCH_B_OUTPUT: OutputCell = {
  kind: "lines",
  lines: lines("“A holiday where kids have plenty to do”", "· beach 4 minutes away", "· kids club until 20:00", "· breakfast included"),
  truncated: true,
}

const PITCH_GEN_B_CLEAN: PitchDraft = {
  id: "pitch_gen_b",
  subtitle: "«family»",
  costUsd: 0.0211,
  durationS: 2.4,
  tokens: { input: 2104, output: 702 },
  prompt: lines("pitch_v7 · 6 slots", "$persona = «family»"),
  output: PITCH_B_OUTPUT,
  check: { score: { value: 0.82, judges: [0.84, 0.83, 0.79] }, note: { text: "facts check out", pass: true } },
  status: "ok",
}

const PITCH_GEN_B: Readonly<Record<Divergence, PitchDraft>> = {
  degraded: {
    id: "pitch_gen_b",
    fallback: "mini",
    subtitle: "«family»",
    costUsd: 0.0611,
    costFactor: 2.9,
    durationS: 7.3,
    tokens: { input: 6412, output: 5316 },
    prompt: lines("pitch_v7 · 6 slots", "$persona = «family»", "+ attempt 2 issues block"),
    output: PITCH_B_OUTPUT,
    check: { score: { value: 0.79, judges: [0.8, 0.81, 0.76] }, note: { text: "no remarks, but a fallback model" } },
    status: "degraded",
  },
  clean: PITCH_GEN_B_CLEAN,
  input: PITCH_GEN_B_CLEAN,
  failed: {
    id: "pitch_gen_b",
    subtitle: "«family»",
    costUsd: 0.01,
    durationS: 4.9,
    tokens: { input: 4208, output: 4414 },
    prompt: lines("pitch_v7 · 6 slots", "$persona = «family»", "+ attempt 2 issues block"),
    output: { kind: "lines", lines: lines("no output — schema failed on every attempt") },
    check: { checks: [{ name: "schema Pitch", pass: false }], note: { text: "retries exhausted · no fallback profile", pass: false } },
    status: "failed",
  },
}

const PITCH_GEN_C: PitchDraft = {
  id: "pitch_gen_c",
  subtitle: "“budget”",
  costUsd: 0.0106,
  durationS: 1.6,
  tokens: { input: 2104, output: 741 },
  prompt: lines("pitch_v7 · 6 slots", "$persona = “budget”"),
  output: {
    kind: "lines",
    lines: [["“Sochi without overpaying”"], ["· price for 3 nights"], ["· ", { text: "“right on the water” (240 m)", mark: "issue" }], ["· transfer included"]],
    truncated: true,
  },
  check: { score: { value: 0.64, judges: [0.72, 0.41, 0.79] }, note: { text: "facts: 240 m ≠ “right on the water”", pass: false } },
  status: "ok",
}

const PITCH_GEN_D: PitchDraft = {
  id: "pitch_gen_d",
  subtitle: "“business”",
  costUsd: 0.0112,
  durationS: 2,
  tokens: { input: 2104, output: 612 },
  prompt: lines("pitch_v7 · 6 slots", "$persona = “business”"),
  output: {
    kind: "lines",
    lines: lines("“Negotiations by the sea”", "· room for 20", "· 240 m to beach", "· late checkout"),
    truncated: true,
  },
  check: { score: { value: 0.86, judges: [0.84, 0.91, 0.83] }, note: { text: "facts check out · quorum 2/3", pass: true } },
  status: "ok",
  selected: true,
}

const ATTEMPT_LADDERS: Readonly<Record<Divergence, AttemptLadder | null>> = {
  degraded: {
    columnId: columnId("pitch_gen_b"),
    callLabel: "pitch_gen_b",
    chain: "429 → schema failed → truncated 4096 → fallback_profile (gpt-5.1-mini)",
    billedUsd: 0.0611,
    failedUsd: 0.01,
    attempts: [
      { n: 1, durationS: 0, outcome: "429 Too Many Requests", link: "retry · backoff 400 ms", tokens: { input: 0, output: 0 }, costUsd: 0, result: "failed" },
      { n: 2, durationS: 1.8, outcome: "schema failed · 2 issues", link: "repair · issues into prompt", tokens: { input: 2104, output: 318 }, costUsd: 0.004, result: "failed" },
      { n: 3, durationS: 3.1, outcome: "truncated at 4096", link: "retry with 8192 limit", tokens: { input: 2104, output: 4096 }, costUsd: 0.006, result: "failed" },
      { n: 4, durationS: 2.4, outcome: "ok / DEGRADED", link: "fallback_profile → mini", tokens: { input: 2104, output: 902 }, costUsd: 0.011, result: "degraded" },
    ],
  },
  clean: null,
  input: null,
  failed: {
    columnId: columnId("pitch_gen_b"),
    callLabel: "pitch_gen_b",
    chain: "429 → schema failed → truncated 4096 → no fallback profile",
    billedUsd: 0.01,
    failedUsd: 0.01,
    attempts: [
      { n: 1, durationS: 0, outcome: "429 Too Many Requests", link: "retry · backoff 400 ms", tokens: { input: 0, output: 0 }, costUsd: 0, result: "failed" },
      { n: 2, durationS: 1.8, outcome: "schema failed · 2 issues", link: "repair · issues into prompt", tokens: { input: 2104, output: 318 }, costUsd: 0.004, result: "failed" },
      { n: 3, durationS: 3.1, outcome: "truncated at 4096", link: "stop · retries exhausted", tokens: { input: 2104, output: 4096 }, costUsd: 0.006, result: "failed" },
    ],
  },
}

const pitchDraftColumn = (build: Build, parent: string, draft: PitchDraft): CallColumn => {
  const node = nodeOf(build, draft.id)
  return column(build, parent, draft.id, {
    name: draft.id,
    kind: node.kind,
    status: draft.status,
    ...familyOf(node),
    subtitle: draft.subtitle,
    ...(draft.selected === true ? { flags: ["selected"] } : {}),
    agent: {
      title: modelTitle(node, draft.fallback),
      costUsd: usdOf(build, draft.costUsd),
      ...(draft.costFactor === undefined ? {} : { costFactor: draft.costFactor }),
      durationS: secondsOf(build, draft.durationS),
      tokens: draft.tokens,
      config: agentConfig(draft.id),
    },
    prompt: draft.prompt,
    output: draft.output,
    check: draft.check,
  })
}

const scaledLadder = (build: Build, ladder: AttemptLadder): AttemptLadder => ({
  ...ladder,
  billedUsd: usdOf(build, ladder.billedUsd),
  failedUsd: usdOf(build, ladder.failedUsd),
  attempts: ladder.attempts.map((attempt) => ({ ...attempt, costUsd: usdOf(build, attempt.costUsd), durationS: secondsOf(build, attempt.durationS) })),
})

const attemptsOf = (build: Build, divergence: Divergence): { readonly attempts?: AttemptLadder } => {
  const ladder = ATTEMPT_LADDERS[divergence]
  return ladder === null ? {} : { attempts: scaledLadder(build, ladder) }
}

const pitchDivergence = (build: Build, divergence: Divergence): StageRun => {
  const group = "pitch_divergence"
  const drafts = [PITCH_GEN_A, PITCH_GEN_B[divergence], PITCH_GEN_C, PITCH_GEN_D]
  return stageRun(build, group, {
    kind: "diverge",
    fanOut: 4,
    description: { kind: "families", count: 4 },
    groups: [
      {
        id: group,
        kind: "diverge",
        rows: [{ key: "call" }, { key: "agent" }, { key: "input" }, { key: "prompt" }, { key: "output", detail: "Pitch" }, { key: "postCheck" }],
        columns: drafts.map((draft) => pitchDraftColumn(build, group, draft)),
        shared: {
          input: {
            kind: "refs",
            refs: [
              { provenance: "generated", label: "ranked·3", value: "rank_hotels" },
              { provenance: "knowledge", label: "tone·4", value: "brand_voice v3" },
              { provenance: "data", label: "facts", value: "load_hotels" },
              { provenance: "human", label: "brief_extra", value: "@lead" },
            ],
            hash: "9f3c…",
          },
        },
      },
    ],
    ...attemptsOf(build, divergence),
  })
}

const JUDGE_IDS = ["judge_style", "judge_facts", "judge_tone"] as const

const panelTitle = (build: Build, fix: boolean): AgentTitle => ({
  kind: "panel",
  families: JUDGE_IDS.map((id) => nodeOf(build, id).model?.family ?? "anthropic"),
  judges: JUDGE_IDS.length,
  fix,
  fixNode: nodeOf(build, "fix_draft").id,
})

const loopColumn = (build: Build, parent: string, id: string, fields: ColumnFields): CallColumn => column(build, parent, id, fields, "fix_draft")

const criticLoop = (build: Build): StageRun => {
  const group = "critic_loop"
  const panel = (fix: boolean) => panelTitle(build, fix)
  return stageRun(build, group, {
    kind: "loop",
    fanOut: 4,
    description: { kind: "loop", body: "judge_panel quorum(2) + fix_draft", exit: { kind: "stagnation" } },
    groups: [
      {
        id: group,
        kind: "loop",
        rows: rows("call", "agent", "input", "prompt", "output", "postCheck"),
        columns: [
          loopColumn(build, group, "iteration_1", {
            name: "iteration 1",
            status: "ok",
            flags: ["loopBody"],
            agent: {
              title: panel(true),
              costUsd: usdOf(build, 0.0512),
              breakdown: { judgesUsd: [usdOf(build, 0.0121), usdOf(build, 0.0042), usdOf(build, 0.0038)], fixUsd: usdOf(build, 0.0311) },
              durationS: secondsOf(build, 2.1),
              calls: 4,
              config: agentConfig("iteration"),
            },
            input: { kind: "text", lines: lines("✦ draft·v1 ← pitch_gen_d", "“Negotiations by the sea”") },
            prompt: lines("judge_v2 ×3 · fix_v4", "+ 3 remarks into the fix prompt"),
            output: { kind: "lines", lines: lines("draft·v2 — 3 factual edits", "“240 m to beach” instead of “on the water”") },
            check: { score: { value: 0.61, threshold: THRESHOLD } },
          }),
          loopColumn(build, group, "iteration_2", {
            name: "iteration 2",
            status: "ok",
            flags: ["loopBody"],
            agent: {
              title: panel(true),
              costUsd: usdOf(build, 0.0498),
              breakdown: { judgesUsd: [usdOf(build, 0.0118), usdOf(build, 0.0041), usdOf(build, 0.0036)], fixUsd: usdOf(build, 0.0303) },
              durationS: secondsOf(build, 2),
              calls: 4,
              config: agentConfig("iteration"),
            },
            input: { kind: "text", lines: lines("✦ draft·v2 ← fix_draft it.1") },
            prompt: lines("judge_v2 ×3 · fix_v4", "+ 2 tone remarks"),
            output: { kind: "lines", lines: lines("draft·v3 — 2 tone edits", "exclamations removed") },
            check: { score: { value: 0.74, previous: 0.61, threshold: THRESHOLD } },
          }),
          loopColumn(build, group, "iteration_3", {
            name: "iteration 3",
            status: "ok",
            flags: ["loopBody", "best"],
            agent: {
              title: panel(true),
              costUsd: usdOf(build, 0.0547),
              breakdown: { judgesUsd: [usdOf(build, 0.0124), usdOf(build, 0.0044), usdOf(build, 0.0039)], fixUsd: usdOf(build, 0.034) },
              durationS: secondsOf(build, 2.1),
              calls: 4,
              config: agentConfig("iteration"),
            },
            input: { kind: "text", lines: lines("✦ draft·v3 ← fix_draft it.2") },
            prompt: lines("judge_v2 ×3 · fix_v4", "no remarks"),
            output: { kind: "lines", lines: lines("draft·v3 — 0 edits", "quorum 2/3 facts confirmed") },
            check: { score: { value: 0.81, previous: 0.74, threshold: THRESHOLD } },
          }),
          loopColumn(build, group, "iteration_4", {
            name: "iteration 4",
            status: "aborted",
            flags: ["loopBody"],
            agent: {
              title: panel(false),
              costUsd: usdOf(build, 0.055),
              breakdown: { judgesUsd: [usdOf(build, 0.0126), usdOf(build, 0.0045), usdOf(build, 0.0039)], fixUsd: null },
              durationS: secondsOf(build, 1.9),
              calls: 3,
              config: agentConfig("iteration"),
            },
            input: { kind: "text", lines: lines("✦ draft·v3 — same candidate hash") },
            prompt: lines("judge_v2 ×3", "fix not reached — loop exited"),
            output: { kind: "status", status: "aborted" },
            check: { score: { value: 0.814, previous: 0.81, threshold: THRESHOLD, stopped: true } },
          }),
        ],
      },
    ],
    exit: {
      conditions: [
        { kind: "iterations", used: 4, max: 8, fired: false },
        { kind: "budget", spentUsd: usdOf(build, 0.211), limitUsd: 0.5, fired: false },
        { kind: "stagnation", delta: 0.004, epsilon: 0.01, fired: true },
        { kind: "threshold", score: 0.814, target: THRESHOLD, afterFix: false, fired: false },
        { kind: "repeatedCandidate", fired: false },
      ],
      note: "Plateau between 3 and 4 — money stopped buying quality",
    },
  })
}

const BRAND_GUARD: Readonly<Record<Decision, CheckCell>> = {
  awaiting: {
    checks: [{ name: "shot 4 shows a logo", pass: false }],
    note: { text: "brand guard fired → needs_human", pass: false },
  },
  approved: {
    checks: [{ name: "no logo in shots", pass: true }],
    note: { text: "brand guard passed · 4 of 4 shots clean" },
  },
}

const ASSET_INPUTS: Readonly<Record<string, readonly ContentPart[]>> = {
  render_hero: [
    { kind: "image", name: "hotel_photos[0..7]", meta: "8 images · 22.4 MB · exif kept", width: 4032, height: 3024, caption: "4032×3024 · jpeg" },
    { kind: "text", name: "pitch.title", meta: "21 chars", text: "“A work trip with the family”" },
    { kind: "json", name: "facts", meta: "7 fields", text: "beach_m 2100 · pool true" },
  ],
  voice_pitch: [
    { kind: "text", name: "pitch.body", meta: "read time ~38 s", text: "412 chars · 3 paragraphs" },
    {
      kind: "audio",
      name: "brand_voice_ref.wav",
      meta: "0:12 · 48 kHz · reference timbre",
      waveform: waveform(31, 25, 30, 40, 33, 30, 37, 38, 20, 40, 23, 22, 40, 19, 26, 19, 20, 33, 38, 36, 34, 19),
    },
  ],
  cut_teaser: [
    { kind: "image", name: "hero.png", meta: "from render_hero", width: 1536, height: 1024, caption: "1536×1024" },
    { kind: "audio", name: "voiceover.mp3", meta: "0:41", waveform: waveform(32, 26, 36, 25, 27, 33, 36, 33, 20, 32, 36, 26, 36, 20, 34, 32, 18, 39) },
    { kind: "text", name: "shotlist", meta: "from pitch.hooks", text: "4 shots · pan → pool → table → logo" },
  ],
}

const ASSET_OUTPUTS: Readonly<Record<string, readonly ContentPart[]>> = {
  render_hero: [
    { kind: "image", name: "hero.png", meta: "1.8 MB · seed 1337 · 2 rejected", width: 1536, height: 1024, caption: "1536×1024 · png", version: "v3" },
    { kind: "text", name: "alt_text", meta: "46 chars", text: "“Pool terrace at dusk, family table set for six”" },
  ],
  voice_pitch: [
    {
      kind: "audio",
      name: "voiceover.mp3",
      meta: "0:41 · 128 kbps · 1.3 MB",
      waveform: waveform(38, 35, 22, 28, 38, 29, 24, 37, 25, 32, 25, 26, 21, 39, 19, 18, 22, 18, 34, 29, 25, 19, 28, 22, 37, 18),
    },
    { kind: "document", name: "captions.vtt", meta: "2.1 KB", caption: "14 cues · ru-RU · aligned" },
  ],
  cut_teaser: [
    {
      kind: "video",
      name: "teaser_15s.mp4",
      meta: "8.4 MB · h264 · 3 s per shot",
      width: 1080,
      height: 1920,
      frameTimesS: [0, 3, 6, 9],
      playhead: 0.34,
      caption: "0:15 · 1080×1920 · 24 fps",
    },
    { kind: "image", name: "poster.jpg", meta: "frame @ 0:02", width: 1080, height: 1920, caption: "1080×1920" },
  ],
}

const partsOf = (table: Readonly<Record<string, readonly ContentPart[]>>, id: string): readonly ContentPart[] => table[id] ?? []

const ASSET_SUBTITLE: Readonly<Record<string, string>> = {
  render_hero: "image model",
  voice_pitch: "speech model",
  cut_teaser: "video model",
}

const assetFields = (build: Build, id: string): Pick<CallColumn, "name" | "kind" | "family" | "subtitle"> => {
  const node = nodeOf(build, id)
  return { name: id, kind: node.kind, ...familyOf(node), subtitle: `${ASSET_SUBTITLE[id] ?? "model"} · ${modelName(node)}` }
}

const assetRender = (build: Build, decision: Decision): StageRun => {
  const group = "asset_render"
  return stageRun(build, group, {
    kind: "parallel",
    description: { kind: "text", text: "three modalities from one pitch · image, speech, video" },
    groups: [
      {
        id: group,
        kind: "parallel",
        rows: rows("columns", "call", "agent", "input", "prompt", "output", "postCheck"),
        columns: [
          column(build, group, "render_hero", {
            ...assetFields(build, "render_hero"),
            status: "ok",
            agent: { costUsd: usdOf(build, 0.084), durationS: secondsOf(build, 14.2), config: { agent: "render_hero", extra: "size 1536×1024 · quality high" } },
            input: { kind: "parts", parts: partsOf(ASSET_INPUTS, "render_hero") },
            prompt: [["image_brief v2 — “", { text: "$pitch.title", mark: "text" }, " · dusk, pool, family table, no people faces”"]],
            output: { kind: "parts", parts: partsOf(ASSET_OUTPUTS, "render_hero") },
            check: {
              checks: [
                { name: "no faces", pass: true },
                { name: "3:2 ratio", pass: true },
              ],
              note: { text: "clip score 0.88 vs alt_text" },
            },
          }),
          column(build, group, "voice_pitch", {
            ...assetFields(build, "voice_pitch"),
            status: "ok",
            agent: { costUsd: usdOf(build, 0.0092), durationS: secondsOf(build, 3.1), config: { agent: "voice_pitch", extra: "voice calm_f · speed 0.95" } },
            input: { kind: "parts", parts: partsOf(ASSET_INPUTS, "voice_pitch") },
            prompt: [
              [
                "read_pitch v1 — “",
                { text: "$pitch.body", mark: "text" },
                ", warm and unhurried, match ",
                { text: "$brand_voice_ref", mark: "audio" },
                "”",
              ],
            ],
            output: { kind: "parts", parts: partsOf(ASSET_OUTPUTS, "voice_pitch") },
            check: { checks: [{ name: "transcript = pitch.body", pass: true }], note: { text: "WER 1.2 % · loudness −16 LUFS" } },
          }),
          column(build, group, "cut_teaser", {
            ...assetFields(build, "cut_teaser"),
            status: "ok",
            agent: { costUsd: usdOf(build, 0.41), durationS: secondsOf(build, 48.6), config: { agent: "cut_teaser", extra: "15 s · 1080×1920 · 24 fps" } },
            input: { kind: "parts", parts: partsOf(ASSET_INPUTS, "cut_teaser") },
            prompt: [
              [
                "teaser_cut v4 — “4 shots from ",
                { text: "$hero", mark: "image" },
                ", cut to ",
                { text: "$voiceover", mark: "audio" },
                " beats”",
              ],
            ],
            output: { kind: "parts", parts: partsOf(ASSET_OUTPUTS, "cut_teaser") },
            check: BRAND_GUARD[decision],
          }),
        ],
      },
    ],
  })
}

const decisionColumns = (build: Build, decision: Decision): readonly CallColumn[] => {
  const group = "decision"
  const columns: Readonly<Record<Decision, readonly CallColumn[]>> = {
    awaiting: [
      column(build, group, "publish_deck", {
        name: "publish_deck",
        kind: "tool",
        status: "idle",
        case: "approved",
        agent: { title: { kind: "text", text: "deck.publish · write" }, costUsd: 0, config: agentConfig("publish_deck") },
        output: { kind: "status", status: "skipped", case: "approved" },
      }),
      column(build, group, "decide_pitch", {
        name: "decide_pitch",
        kind: "human",
        status: "waiting",
        case: "needs_human",
        agent: { title: { kind: "text", text: "@lead · SLA 4 h · escalate" }, costUsd: 0, waitingMinutes: 12, config: agentConfig("decide_pitch") },
        input: { kind: "text", lines: lines("✦ best_pitch ← loop it.3", "+ 3 judge verdict") },
        prompt: lines("the verdict form is built from the step schema"),
        output: { kind: "status", status: "awaiting", deadlineMinutes: 192 },
      }),
      column(build, group, "archive_draft", {
        name: "archive_draft",
        kind: "fn",
        status: "idle",
        case: "rejected",
        agent: { title: { kind: "text", text: "archive_draft() · pure" }, costUsd: 0, config: agentConfig("archive_draft") },
        output: { kind: "status", status: "skipped", case: "rejected" },
      }),
    ],
    approved: [
      column(build, group, "publish_deck", {
        name: "publish_deck",
        kind: "tool",
        status: "ok",
        case: "approved",
        agent: { title: { kind: "text", text: "deck.publish · write" }, costUsd: 0, durationS: secondsOf(build, 1.2), config: agentConfig("publish_deck") },
        input: { kind: "text", lines: lines("✦ best_pitch ← loop it.3", "+ 3 judge verdict") },
        output: { kind: "lines", lines: lines("deck published · 12 slides", "deck_7f2a.pdf · 3.4 MB") },
      }),
      column(build, group, "decide_pitch", {
        name: "decide_pitch",
        kind: "human",
        status: "skipped",
        case: "needs_human",
        agent: { title: { kind: "text", text: "@lead · SLA 4 h · escalate" }, costUsd: 0, config: agentConfig("decide_pitch") },
        prompt: lines("the verdict form is built from the step schema"),
        output: { kind: "status", status: "skipped", case: "needs_human" },
      }),
      column(build, group, "archive_draft", {
        name: "archive_draft",
        kind: "fn",
        status: "skipped",
        case: "rejected",
        agent: { title: { kind: "text", text: "archive_draft() · pure" }, costUsd: 0, config: agentConfig("archive_draft") },
        output: { kind: "status", status: "skipped", case: "rejected" },
      }),
    ],
  }
  return columns[decision]
}

const JUDGE_STYLE: JudgeSpec = { id: "judge_style", costUsd: 0.0041, durationS: 0.8, input: "pitch + brand_voice v4" }
const JUDGE_FACTS: JudgeSpec = { id: "judge_facts", costUsd: 0.0028, durationS: 0.6, input: "pitch + facts" }
const JUDGE_TONE: JudgeSpec = { id: "judge_tone", costUsd: 0.0019, durationS: 0.5, input: "pitch + tone.chunks" }

const claimsBlock = (build: Build, path: string, claims: readonly ClaimFact[]): NestedBlock => ({
  kind: "map",
  fanOut: claims.length,
  titleParts: ["map", "judge_facts"],
  group: {
    id: "claims",
    kind: "map",
    rows: rows("columns", "call", "input", "output"),
    columns: claims.map((claim, index) =>
      column(
        build,
        path,
        `facts_${String(index)}`,
        {
          name: `facts[${String(index)}]`,
          kind: nodeOf(build, JUDGE_FACTS.id).kind,
          status: "ok",
          callText: claim.claim,
          input: { kind: "text", lines: lines(claim.source) },
          output: { kind: "verdict", verdict: claim.verdict },
        },
        JUDGE_FACTS.id,
      ),
    ),
  },
})

const judgeColumn = (build: Build, parent: string, spec: JudgeSpec, fact: JudgeFact): CallColumn => {
  const node = nodeOf(build, spec.id)
  return column(build, parent, spec.id, {
    name: spec.id,
    kind: node.kind,
    status: "ok",
    ...familyOf(node),
    subtitle: modelName(node),
    agent: { costUsd: usdOf(build, spec.costUsd), durationS: secondsOf(build, spec.durationS), config: agentConfig(spec.id) },
    input: { kind: "text", lines: lines(spec.input) },
    output: { kind: "verdict", verdict: fact.verdict, score: fact.score, ...remarkOf(fact.remark) },
  })
}

const judgePanelBlock = (build: Build, path: string, iteration: number, panel: JudgePanelFacts): NestedBlock => {
  const factsColumn = judgeColumn(build, path, JUDGE_FACTS, panel.facts)
  return {
    kind: "parallel",
    fanOut: 3,
    titleParts: ["judge_panel", `iteration ${String(iteration)}`],
    quorum: { required: 2, total: 3 },
    group: {
      id: "judge_panel",
      kind: "parallel",
      rows: [{ key: "columns" }, { key: "call", detail: "judge_panel" }, { key: "agent" }, { key: "input", detail: panel.draft }, { key: "output" }],
      columns: [
        judgeColumn(build, path, JUDGE_STYLE, panel.style),
        { ...factsColumn, child: { label: "map", block: claimsBlock(build, joinPath(path, JUDGE_FACTS.id), panel.claims) } },
        judgeColumn(build, path, JUDGE_TONE, panel.tone),
      ],
    },
  }
}

const iterationColumn = (build: Build, parent: string, iteration: LoopIteration, index: number): CallColumn => {
  const n = index + 1
  const id = `iteration_${String(n)}`
  return loopColumn(build, parent, id, {
    name: `iteration ${String(n)}`,
    kind: nodeOf(build, "fix_draft").kind,
    status: "ok",
    callText: "fix_draft",
    ...(iteration.best === true ? { flags: ["best"] } : {}),
    agent: { costUsd: usdOf(build, iteration.costUsd), durationS: secondsOf(build, iteration.durationS), config: agentConfig("fix_draft") },
    input: refs(iteration.input),
    output: { kind: "lines", lines: lines(iteration.output) },
    check: { score: scoreFact(iteration) },
    child: { label: "judges", block: judgePanelBlock(build, joinPath(parent, id), n, iteration.judges) },
  })
}

const personaLoopBlock = (build: Build, path: string, persona: Persona): NestedBlock => ({
  kind: "loop",
  fanOut: persona.iterations.length,
  titleParts: ["critic_loop", persona.id],
  group: {
    id: "critic_loop",
    kind: "loop",
    rows: rows("columns", "call", "agent", "input", "output", "postCheck"),
    columns: persona.iterations.map((iteration, index) => iterationColumn(build, path, iteration, index)),
  },
})

const B2B_CLAIMS: readonly ClaimFact[] = [
  { claim: "room for 20", source: "facts.rooms", verdict: "matched" },
  { claim: "beach 240 m", source: "facts.beach_m", verdict: "matched" },
  { claim: "airport transfer", source: "— absent from facts", verdict: "invented" },
]

const B2C_CLAIMS: readonly ClaimFact[] = [
  { claim: "beach 4 minutes away", source: "facts.beach_m", verdict: "matched" },
  { claim: "kids club until 20:00", source: "facts.kids_club", verdict: "matched" },
  { claim: "breakfast included", source: "facts.board", verdict: "matched" },
]

const MICE_CLAIMS: readonly ClaimFact[] = [
  { claim: "hall for 120 guests", source: "facts.hall_capacity", verdict: "matched" },
  { claim: "sea view terrace", source: "facts.terrace", verdict: "matched" },
  { claim: "projector included", source: "facts.equipment", verdict: "matched" },
]

const approved = (score: number, remark?: string): JudgeFact => ({ score, verdict: "approved", ...remarkOf(remark) })

const PERSONAS: readonly Persona[] = [
  {
    id: "persona_b2c",
    audience: "B2C · families",
    costUsd: 0.0712,
    durationS: 6.4,
    prompt: "$persona «family»",
    output: "“A holiday where kids have plenty to do” · 3 hooks",
    passed: 3,
    note: "score 0.91",
    iterations: [
      {
        costUsd: 0.0266,
        durationS: 2.2,
        input: { provenance: "generated", label: "draft·v1", value: "persona_b2c" },
        output: "draft·v2 — kids club hours added",
        score: 0.72,
        judges: { draft: "draft·v1", style: approved(0.74), facts: approved(0.69, "kids club hours missing"), tone: approved(0.73), claims: B2C_CLAIMS },
      },
      {
        costUsd: 0.0249,
        durationS: 2.1,
        input: { provenance: "generated", label: "draft·v2", value: "fix it.1" },
        output: "draft·v3 — breakfast wording fixed",
        score: 0.86,
        previous: 0.72,
        judges: { draft: "draft·v2", style: approved(0.87), facts: approved(0.85), tone: approved(0.86), claims: B2C_CLAIMS },
      },
      {
        costUsd: 0.0197,
        durationS: 1.7,
        input: { provenance: "generated", label: "draft·v3", value: "fix it.2" },
        output: "draft·v3 accepted · quorum 3/3",
        score: 0.91,
        previous: 0.86,
        best: true,
        judges: { draft: "draft·v3", style: approved(0.9), facts: approved(0.93), tone: approved(0.9), claims: B2C_CLAIMS },
      },
    ],
  },
  {
    id: "persona_b2b",
    audience: "B2B · corporate",
    costUsd: 0.1043,
    durationS: 9.1,
    prompt: "$persona «business»",
    output: "“Negotiations by the sea” · room, transfer, late checkout",
    passed: 2,
    note: "score 0.84 · stop on stagnation",
    iterations: [
      {
        costUsd: 0.0281,
        durationS: 2.4,
        input: { provenance: "generated", label: "draft·v1", value: "persona_b2b" },
        output: "draft·v2 — “perfect” removed, room added",
        score: 0.62,
        judges: {
          draft: "draft·v1",
          style: approved(0.64),
          facts: { score: 0.55, verdict: "rejected", remark: "“perfect” is unsupported" },
          tone: approved(0.67),
          claims: B2B_CLAIMS,
        },
      },
      {
        costUsd: 0.0294,
        durationS: 2.5,
        input: { provenance: "generated", label: "draft·v2", value: "fix it.1" },
        output: "draft·v3 — 2 tone edits",
        score: 0.79,
        previous: 0.62,
        judges: { draft: "draft·v2", style: approved(0.8), facts: approved(0.76, "transfer claim unverified"), tone: approved(0.81), claims: B2B_CLAIMS },
      },
      {
        costUsd: 0.0301,
        durationS: 2.6,
        input: { provenance: "generated", label: "draft·v3", value: "fix it.2" },
        output: "draft·v3 accepted · quorum 2/3",
        score: 0.84,
        previous: 0.79,
        best: true,
        judges: { draft: "draft·v3", style: approved(0.83), facts: approved(0.88, "third hook empty"), tone: approved(0.8), claims: B2B_CLAIMS },
      },
      {
        costUsd: 0.0167,
        durationS: 1.6,
        input: { provenance: "generated", label: "draft·v3", unchanged: true },
        output: "fix not run — stop on stagnation",
        score: 0.844,
        previous: 0.84,
        stopped: true,
        judges: { draft: "draft·v3", style: approved(0.84), facts: approved(0.89, "third hook empty"), tone: approved(0.8), claims: B2B_CLAIMS },
      },
    ],
  },
  {
    id: "persona_mice",
    audience: "MICE · events",
    costUsd: 0.0684,
    durationS: 5.9,
    prompt: "$persona «events”",
    output: "“A conference with a sea view” · 2 hooks",
    passed: 3,
    note: "score 0.93",
    iterations: [
      {
        costUsd: 0.0302,
        durationS: 2.5,
        input: { provenance: "generated", label: "draft·v1", value: "persona_mice" },
        output: "draft·v2 — hall capacity added",
        score: 0.81,
        judges: { draft: "draft·v1", style: approved(0.83), facts: approved(0.78, "hall capacity missing"), tone: approved(0.82), claims: MICE_CLAIMS },
      },
      {
        costUsd: 0.0214,
        durationS: 1.8,
        input: { provenance: "generated", label: "draft·v2", value: "fix it.1" },
        output: "draft·v3 accepted · quorum 3/3",
        score: 0.93,
        previous: 0.81,
        best: true,
        judges: { draft: "draft·v2", style: approved(0.92), facts: approved(0.95), tone: approved(0.92), claims: MICE_CLAIMS },
      },
    ],
  },
]

const PERSONA_ASSERTIONS = 3

const personaColumn = (build: Build, parent: string, persona: Persona): CallColumn => {
  const node = nodeOf(build, persona.id)
  return column(build, parent, persona.id, {
    name: persona.id,
    kind: node.kind,
    status: "ok",
    ...familyOf(node),
    subtitle: `${persona.audience} · ${modelName(node)}`,
    agent: { costUsd: usdOf(build, persona.costUsd), durationS: secondsOf(build, persona.durationS) },
    prompt: lines(persona.prompt),
    output: { kind: "lines", lines: lines(persona.output) },
    check: { ratio: { passed: persona.passed, total: PERSONA_ASSERTIONS }, note: { text: persona.note } },
    child: { label: "loop", block: personaLoopBlock(build, joinPath(parent, persona.id), persona) },
  })
}

const DECISION_DESCRIPTION: Readonly<Record<Decision, string>> = {
  awaiting: "exactly one branch by verdict · needs_human selected",
  approved: "exactly one branch by verdict · approved selected",
}

const DECISION_DURATION: Readonly<Record<Decision, Pick<StageFields, "durationS">>> = {
  awaiting: { durationS: null },
  approved: {},
}

const pitchDecision = (build: Build, decision: Decision): StageRun => {
  const decisionGroup: MatrixGroup = {
    id: "decision",
    kind: "switch",
    rows: rows("call", "agent", "input", "prompt", "output"),
    columns: decisionColumns(build, decision),
  }
  const personasGroup: MatrixGroup = {
    id: "personas",
    kind: "diverge",
    rows: [{ key: "columns" }, { key: "call" }, { key: "model" }, { key: "prompt", detail: "persona_v3" }, { key: "output" }, { key: "assertions" }],
    columns: PERSONAS.map((persona) => personaColumn(build, "personas", persona)),
  }
  return stageRun(build, "pitch_decision", {
    kind: "switch",
    description: { kind: "text", text: DECISION_DESCRIPTION[decision] },
    ...DECISION_DURATION[decision],
    groups: [decisionGroup, personasGroup],
  })
}

const fullTail = (build: Build, decision: Decision): readonly StageRun[] => [
  criticLoop(build),
  assetRender(build, decision),
  pitchDecision(build, decision),
]

const DIVERGENCE_TAIL: Readonly<Record<Divergence, (build: Build, decision: Decision) => readonly StageRun[]>> = {
  degraded: fullTail,
  clean: fullTail,
  failed: () => [],
  input: () => [],
}

const pitchStages = (build: Build, profile: PitchRunProfile): readonly StageRun[] => [
  dataLoad(build),
  hotelScoring(build),
  scoreReduce(build),
  pitchDivergence(build, profile.divergence),
  ...DIVERGENCE_TAIL[profile.divergence](build, profile.decision),
]

const PITCH_DEFAULT_OPEN: readonly ColumnPath[] = [
  columnPath("personas/persona_b2b"),
  columnPath("personas/persona_b2b/iteration_3"),
  columnPath("personas/persona_b2b/iteration_3/judge_facts"),
]

const DECISION_OUTCOME: Readonly<Record<Decision, (run: RunSummary, gapS: number) => RunOutcome>> = {
  awaiting: (run, gapS) => ({ status: "awaiting", billedUsd: run.costUsd, ...traceGapOf(gapS) }),
  approved: (run) => ({ status: run.status, billedUsd: run.costUsd }),
}

const traceGapOf = (seconds: number): Pick<RunOutcome, "traceGap"> =>
  seconds === 0 ? {} : { traceGap: { seconds, fromStage: pitchStageNumber("critic_loop"), toStage: pitchStageNumber("asset_render") } }

const decisionOutcome = (run: RunSummary, decision: Decision, gapS: number): RunOutcome => DECISION_OUTCOME[decision](run, gapS)

const OUTCOME_OF: Readonly<Record<Divergence, (run: RunSummary, decision: Decision, gapS: number) => RunOutcome>> = {
  degraded: decisionOutcome,
  clean: decisionOutcome,
  failed: (run) => ({ status: "failed", billedUsd: run.costUsd }),
  input: (run) => ({ status: "awaiting", billedUsd: run.costUsd }),
}

const DEFAULT_OPEN_OF: Readonly<Record<Divergence, readonly ColumnPath[]>> = {
  degraded: PITCH_DEFAULT_OPEN,
  clean: PITCH_DEFAULT_OPEN,
  failed: [],
  input: [],
}

const pitchStageNumber = (id: string): number => catalogStage(WORKFLOWS.pitchPipeline, id).number

const metricsOf = (run: RunSummary, profile: MetricsProfile): RunMetrics => ({
  cost: { ...profile.cost, valueUsd: run.costUsd },
  time: { ...profile.time, valueS: run.durationS },
  tokens: profile.tokens,
  assertions: { ...profile.assertions, ...run.assertions },
})

const fittedScale = (run: RunSummary, gapS: number, stages: readonly StageRun[]): Scale => {
  if (DESIGN_RUNS.has(run.id)) return UNIT
  return { cost: ratioOf(run.costUsd, totalCost(stages)), time: ratioOf(run.durationS - gapS, totalDuration(stages)) }
}

const fittedStages = (run: RunSummary, gapS: number, build: (build: Build) => readonly StageRun[], workflow: string): readonly StageRun[] => {
  const unit = build({ workflow, run: run.id, scale: UNIT })
  const scale = fittedScale(run, gapS, unit)
  return build({ workflow, run: run.id, scale })
}

const pitchRun = (run: RunSummary, profile: PitchRunProfile): DataflowRun => {
  const gapS = profile.metrics.time.traceGapS
  return {
    run,
    metrics: metricsOf(run, profile.metrics),
    stages: fittedStages(run, gapS, (build) => pitchStages(build, profile), WORKFLOWS.pitchPipeline),
    outcome: OUTCOME_OF[profile.divergence](run, profile.decision, gapS),
    defaultOpen: DEFAULT_OPEN_OF[profile.divergence],
  }
}

const rowIds = (...ids: readonly string[]) => ids.map(rowId)

const PITCH_PROFILES: Readonly<Record<string, PitchRunProfile>> = {
  "8247": {
    divergence: "degraded",
    decision: "awaiting",
    metrics: {
      cost: { previousUsd: 0.3102, overEstimateUsd: 0.11 },
      time: { medianS: 16.3, medianRuns: 12, traceGapS: 1.4 },
      tokens: { total: 34218, growth: 1.4, discarded: 9104, input: 21402, output: 12816 },
      assertions: { failedRows: rowIds("07", "19", "33", "41"), failureNote: "all on the empty third hook" },
    },
  },
  "8244": {
    divergence: "input",
    decision: "awaiting",
    metrics: {
      cost: { previousUsd: 0.3102, overEstimateUsd: 0 },
      time: { medianS: 16.3, medianRuns: 12, traceGapS: 0 },
      tokens: { total: 12410, growth: 0.5, discarded: 0, input: 8640, output: 3770 },
      assertions: { failedRows: [], failureNote: "branch d waits for $brief_extra before the critic loop" },
    },
  },
  "8241": {
    divergence: "clean",
    decision: "approved",
    metrics: {
      cost: { previousUsd: 0.2988, overEstimateUsd: 0.02 },
      time: { medianS: 16.1, medianRuns: 11, traceGapS: 0 },
      tokens: { total: 28117, growth: 1.1, discarded: 6240, input: 17630, output: 10487 },
      assertions: { failedRows: rowIds("19", "41"), failureNote: "hook length over the limit" },
    },
  },
  "8236": {
    divergence: "clean",
    decision: "awaiting",
    metrics: {
      cost: { previousUsd: 0.2988, overEstimateUsd: 0.04 },
      time: { medianS: 16.2, medianRuns: 12, traceGapS: 0 },
      tokens: { total: 29870, growth: 1.2, discarded: 7020, input: 18410, output: 11460 },
      assertions: { failedRows: rowIds("12", "33", "41"), failureNote: "facts judge rejects “right on the water” at 240 m" },
    },
  },
  "8233": {
    divergence: "failed",
    decision: "approved",
    metrics: {
      cost: { previousUsd: 0.2988, overEstimateUsd: 0 },
      time: { medianS: 16.2, medianRuns: 12, traceGapS: 0 },
      tokens: { total: 15320, growth: 0.6, discarded: 4096, input: 9420, output: 5900 },
      assertions: {
        failedRows: rowIds("02", "05", "07", "11", "14", "19", "22", "23", "27", "30", "33", "36", "38", "41", "43", "45", "47"),
        failureNote: "pitch_gen_b schema failures stopped the run at stage 4",
      },
    },
  },
  "8229": {
    divergence: "clean",
    decision: "approved",
    metrics: {
      cost: { previousUsd: 0.334, overEstimateUsd: 0 },
      time: { medianS: 16.4, medianRuns: 10, traceGapS: 0 },
      tokens: { total: 27040, growth: 0.9, discarded: 5870, input: 16980, output: 10060 },
      assertions: { failedRows: rowIds("07", "33", "41"), failureNote: "empty third hook on long briefs" },
    },
  },
  "8210": {
    divergence: "clean",
    decision: "approved",
    metrics: {
      cost: { previousUsd: 0.3211, overEstimateUsd: 0.03 },
      time: { medianS: 16.6, medianRuns: 9, traceGapS: 0 },
      tokens: { total: 30214, growth: 1.2, discarded: 7702, input: 18904, output: 11310 },
      assertions: { failedRows: rowIds("07", "12", "19", "33", "41"), failureNote: "tone judge rejects exclamations" },
    },
  },
}

const seoBriefStages = (build: Build): readonly StageRun[] => {
  const draft = nodeOf(build, "draft_brief")
  const judge = nodeOf(build, "check_brief")
  return [
    stageRun(build, "serp_fetch", {
      kind: "seq",
      description: { kind: "toolCalls", count: 1 },
      groups: [
        {
          id: "serp_fetch",
          kind: "seq",
          rows: rows("call", "agent", "input", "prompt", "output"),
          columns: [
            column(build, "serp_fetch", "fetch_serp", {
              name: "fetch_serp",
              kind: nodeOf(build, "fetch_serp").kind,
              status: "ok",
              subtitle: "serp.search · read",
              agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: secondsOf(build, 1.2) },
              input: refs({ provenance: "static", label: 'topic:"family hotels sochi"' }, { provenance: "static", label: "locale:ru-RU" }),
              output: {
                kind: "lines",
                lines: lines("Keyword[] · 24 items", "[0] “sochi hotels with kids club” · 8.1k", "[1] “family resort sochi beach” · 5.4k"),
                truncated: true,
              },
            }),
          ],
        },
      ],
    }),
    stageRun(build, "keyword_clusters", {
      kind: "seq",
      description: { kind: "pureFunction" },
      groups: [
        {
          id: "keyword_clusters",
          kind: "seq",
          rows: rows("call", "agent", "input", "prompt", "output"),
          columns: [
            column(build, "keyword_clusters", "cluster_keywords", {
              name: "cluster_keywords",
              kind: nodeOf(build, "cluster_keywords").kind,
              status: "ok",
              subtitle: "pure",
              agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: secondsOf(build, 0.03) },
              input: refs({ provenance: "generated", label: "keywords·24", value: "fetch_serp" }),
              output: { kind: "lines", lines: lines("Keyword[] · 6 clusters", "family · beach · spa · budget · transfer · events") },
            }),
          ],
        },
      ],
    }),
    stageRun(build, "brief_draft", {
      kind: "seq",
      description: { kind: "text", text: "one brief grounded in the clusters" },
      groups: [
        {
          id: "brief_draft",
          kind: "seq",
          rows: [{ key: "call" }, { key: "agent" }, { key: "input" }, { key: "prompt" }, { key: "output", detail: "Brief" }],
          columns: [
            column(build, "brief_draft", "draft_brief", {
              name: "draft_brief",
              kind: draft.kind,
              status: "ok",
              ...familyOf(draft),
              subtitle: "“parents with kids”",
              agent: {
                title: modelTitle(draft),
                costUsd: usdOf(build, 0.0948),
                durationS: secondsOf(build, 6.1),
                tokens: { input: 3120, output: 1484 },
                config: agentConfig("brief_writer", 0.7, "low"),
              },
              input: refs({ provenance: "generated", label: "clusters·6", value: "cluster_keywords" }, { provenance: "human", label: "audience", value: "@editor" }),
              prompt: lines("write_brief_v2 · 3 slots", "$topic = “family hotels sochi”"),
              output: { kind: "lines", lines: lines("H1 “Family hotels in Sochi by the sea”", "· 9 sections · 1,240 words · FAQ block"), truncated: true },
            }),
          ],
        },
      ],
    }),
    stageRun(build, "brief_check", {
      kind: "seq",
      description: { kind: "text", text: "one judge call · coverage and keyword stuffing" },
      groups: [
        {
          id: "brief_check",
          kind: "seq",
          rows: rows("call", "agent", "input", "prompt", "output", "postCheck"),
          columns: [
            column(build, "brief_check", "check_brief", {
              name: "check_brief",
              kind: judge.kind,
              status: "ok",
              ...familyOf(judge),
              subtitle: modelName(judge),
              agent: {
                title: modelTitle(judge),
                costUsd: usdOf(build, 0.0292),
                durationS: secondsOf(build, 2.27),
                tokens: { input: 2210, output: 180 },
                config: agentConfig("brief_judge", 0, "off"),
              },
              input: refs({ provenance: "generated", label: "brief", value: "draft_brief" }, { provenance: "generated", label: "clusters·6", value: "cluster_keywords" }),
              prompt: lines("check_brief_v1 · 2 slots"),
              output: { kind: "verdict", verdict: "approved", score: 0.93 },
              check: { score: { value: 0.93, threshold: THRESHOLD }, note: { text: "all 24 assertions pass", pass: true } },
            }),
          ],
        },
      ],
    }),
  ]
}

const REVIEW_SCORES = [
  { costUsd: 0.0044, durationS: 0.42, tokens: { input: 402, output: 88 }, note: "★5 · 142 words", sentiment: "sentiment: positive", summary: "“spa and silence”" },
  { costUsd: 0.0041, durationS: 0.39, tokens: { input: 388, output: 84 }, note: "★3 · 96 words", sentiment: "sentiment: mixed", summary: "“noisy at night”" },
  { costUsd: 0.0046, durationS: 0.44, tokens: { input: 415, output: 91 }, note: "★4 · 158 words", sentiment: "sentiment: positive", summary: "“beach close, pricey bar”" },
] as const

const REVIEW_COUNT = 20

const reviewSummarizerStages = (build: Build): readonly StageRun[] => {
  const summarizer = nodeOf(build, "summarize_review")
  return [
    stageRun(build, "review_load", {
      kind: "seq",
      description: { kind: "toolCalls", count: 1 },
      groups: [
        {
          id: "review_load",
          kind: "seq",
          rows: rows("call", "agent", "input", "prompt", "output"),
          columns: [
            column(build, "review_load", "load_reviews", {
              name: "load_reviews",
              kind: nodeOf(build, "load_reviews").kind,
              status: "ok",
              subtitle: "reviews.fetch · read",
              agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: secondsOf(build, 0.8) },
              input: refs({ provenance: "static", label: 'hotel_id:"riviera_sochi"' }, { provenance: "static", label: "limit:20" }),
              output: {
                kind: "lines",
                lines: lines("Review[] · 20 items", "[0] ★5 “quiet, great spa”", "[1] ★3 “noisy at night”", "[2] ★4 “beach close, pricey bar”"),
                truncated: true,
              },
            }),
          ],
        },
      ],
    }),
    stageRun(build, "review_summaries", {
      kind: "map",
      fanOut: REVIEW_COUNT,
      description: { kind: "map", concurrency: 10, source: "load_reviews.out.length" },
      durationS: secondsOf(build, 5.37),
      groups: [
        {
          id: "review_summaries",
          kind: "map",
          rows: rows("call", "agent", "input", "prompt", "output"),
          shared: { prompt: [["summary_v3 · 2 slots: ", { text: "$review", mark: "data" }, " ", { text: "$style", mark: "knowledge" }, " — identical across all 20 calls"]] },
          columns: REVIEW_SCORES.map((review, index) =>
            column(
              build,
              "review_summaries",
              `summarize_review_${String(index)}`,
              {
                name: `summarize_review[${String(index)}]`,
                kind: summarizer.kind,
                status: "ok",
                ...familyOf(summarizer),
                subtitle: `review ${String(index + 1)}`,
                agent: {
                  title: modelTitle(summarizer),
                  costUsd: usdOf(build, review.costUsd),
                  durationS: secondsOf(build, review.durationS),
                  tokens: review.tokens,
                  config: agentConfig(`summarize_review[${String(index)}]`, 0.3, "off"),
                },
                input: { kind: "refs", refs: [{ provenance: "data", label: "review · Review" }], note: review.note },
                output: { kind: "lines", lines: lines(review.sentiment, review.summary) },
              },
              summarizer.id,
            ),
          ),
          summary: {
            hiddenCalls: REVIEW_COUNT - REVIEW_SCORES.length,
            totalUsd: usdOf(build, 0.087),
            medianS: secondsOf(build, 0.42),
            typeName: "Review",
            spread: { min: 0.31, max: 0.94 },
            ok: { passed: REVIEW_COUNT, total: REVIEW_COUNT },
          },
        },
      ],
    }),
    stageRun(build, "summary_merge", {
      kind: "seq",
      description: { kind: "pureFunction" },
      groups: [
        {
          id: "summary_merge",
          kind: "seq",
          rows: rows("call", "agent", "input", "prompt", "output", "postCheck"),
          columns: [
            column(build, "summary_merge", "merge_summaries", {
              name: "merge_summaries",
              kind: nodeOf(build, "merge_summaries").kind,
              status: "ok",
              subtitle: "pure",
              agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: secondsOf(build, 0.03) },
              input: refs({ provenance: "generated", label: "summaries·20", value: "summarize_review[0…19]" }),
              output: { kind: "lines", lines: lines("“Guests love the spa and the quiet;", "night noise and bar prices are the top complaints”") },
              check: { ratio: { passed: 18, total: 18 }, note: { text: "18 of 18 assertions pass", pass: true } },
            }),
          ],
        },
      ],
    }),
  ]
}

type SimpleRunProfile = {
  readonly workflow: string
  readonly metrics: MetricsProfile
  readonly stages: (build: Build) => readonly StageRun[]
}

const SIMPLE_PROFILES: Readonly<Record<string, SimpleRunProfile>> = {
  "8102": {
    workflow: WORKFLOWS.seoBriefWriter,
    stages: seoBriefStages,
    metrics: {
      cost: { previousUsd: 0.131, overEstimateUsd: 0 },
      time: { medianS: 9.9, medianRuns: 8, traceGapS: 0 },
      tokens: { total: 8394, growth: 0.9, discarded: 0, input: 5330, output: 3064 },
      assertions: { failedRows: [], failureNote: "" },
    },
  },
  "7980": {
    workflow: WORKFLOWS.reviewSummarizer,
    stages: reviewSummarizerStages,
    metrics: {
      cost: { previousUsd: 0.091, overEstimateUsd: 0 },
      time: { medianS: 6, medianRuns: 6, traceGapS: 0 },
      tokens: { total: 9850, growth: 1, discarded: 0, input: 8040, output: 1810 },
      assertions: { failedRows: [], failureNote: "" },
    },
  },
}

const simpleRun = (run: RunSummary, profile: SimpleRunProfile): DataflowRun => ({
  run,
  metrics: metricsOf(run, profile.metrics),
  stages: fittedStages(run, profile.metrics.time.traceGapS, profile.stages, profile.workflow),
  outcome: { status: run.status, billedUsd: run.costUsd },
  defaultOpen: [],
})

const runOf = (run: RunSummary): DataflowRun | null => {
  const pitch = PITCH_PROFILES[run.id]
  if (pitch !== undefined) return pitchRun(run, pitch)
  const simple = SIMPLE_PROFILES[run.id]
  if (simple !== undefined) return simpleRun(run, simple)
  return null
}

type RunEntry = { readonly workflow: string; readonly dataflow: DataflowRun }

const workflowRuns = (workflow: string): readonly RunEntry[] =>
  (runLists[workflowKey(workflow)] ?? []).flatMap((run) => {
    const dataflow = runOf(run)
    return dataflow === null ? [] : [{ workflow, dataflow }]
  })

const RUN_ENTRIES: readonly RunEntry[] = Object.values(WORKFLOWS).flatMap(workflowRuns)

export const dataflowRuns: Readonly<Record<string, DataflowRun>> = Object.fromEntries(
  RUN_ENTRIES.map(({ workflow, dataflow }) => [workflowKey(workflow, dataflow.run.id), dataflow]),
)
