import type {
  AgentCell,
  CallColumn,
  CallId,
  CheckCell,
  DatasetColumn,
  DatasetRow,
  DatasetSource,
  MatrixGroup,
  ProvenancedValue,
  RowKey,
  RowOutcome,
  RowResult,
  RowSpec,
  RowTrace,
  RunHistory,
  StageRun,
  TestDetail,
  TestRunSummary,
  TextLine,
  Verdict,
} from "@/domain"
import { callId, columnId, datasetId, nodeId, revisionId, rowId, testId } from "@/data/ids"
import { pitchNode, pitchStage, type CatalogStage } from "./catalog"
import { WORKFLOWS, shortCallId, workflowKey } from "./keys"

type BranchId = "pitch_gen_a" | "pitch_gen_b" | "pitch_gen_c" | "pitch_gen_d"
type Persona = "family" | "premium" | "budget" | "business"
type Band = "high" | "low"
type FailureKind = "hooks" | "title" | "superlatives"

type StepBuild = { readonly stage: StageRun; readonly costUnits: number; readonly tenths: number; readonly calls: number }

type CallOf = (column: string) => CallId

type PitchFacts = {
  readonly hotel: string
  readonly rating: number
  readonly beachM: number
  readonly persona: Persona
  readonly expected: string
}

type Failure = { readonly branch: BranchId; readonly kind: FailureKind }

type BranchSpec = {
  readonly id: BranchId
  readonly costUnits: number
  readonly tenths: number
  readonly inputTokens: number
  readonly outputTokens: number
}

type FailureSpec = {
  readonly assertion: string
  readonly message: string
  readonly output: readonly string[]
}

type DivergePlan = {
  readonly callOf: CallOf
  readonly row: string
  readonly ordinal: number
  readonly facts: PitchFacts
  readonly assertions: readonly string[]
  readonly selected: BranchId
  readonly failure: Failure | null
  readonly frozen: boolean
}

type LoopPlan = {
  readonly callOf: CallOf
  readonly iterations: number
  readonly iterationCalls: readonly number[]
  readonly costUnits: number
  readonly tenths: number
  readonly finalScore: number
  readonly expectedDelta: number
  readonly firstInput: ProvenancedValue
}

type IterationBudget = { readonly costUnits: number; readonly tenths: number; readonly calls: number }

type RowRecord = { readonly row: DatasetRow; readonly result: RowResult; readonly trace: RowTrace }

type TestFixture = {
  readonly detail: Omit<TestDetail, "dataset" | "results"> & { readonly dataset: Omit<TestDetail["dataset"], "rows"> }
  readonly records: readonly RowRecord[]
}

type RowBase = { readonly id: string; readonly ordinal: number }

const USD_UNITS = 10_000
const TENTHS_PER_SECOND = 10
const SCORE_STEPS = 100
const KILOMETRE = 1000
const THRESHOLD = 0.9
const BUDGET_LIMIT_USD = 0.5
const MAX_ITERATIONS = 8
const LOOP_SCORE_STEP = 0.11
const JUDGE_SHARES = [0.58, 0.22] as const
const JUDGE_SHARE_OF_ITERATION = 0.4
const COST_WEIGHT = { body: 12, last: 5 } as const
const TENTHS_WEIGHT = { body: 20, last: 14 } as const
const PANEL_CALLS = { body: 4, last: 3 } as const
const PANEL_FAMILIES = ["judge_style", "judge_facts", "judge_tone"].map((id) => pitchNode(id).model?.family ?? "anthropic")
const LOOP_BODY = "judge_panel quorum(2) + fix_draft"
const PITCH_TEMPLATE = "pitch_v7 · r42"
const LOOP_PROMPT: readonly TextLine[] = [["judge_v2 ×3 · fix_v4"], ["remarks from the previous iteration"]]
const HOOKS_ASSERTION = "hooks[*] non-empty"
const TITLE_ASSERTION = "title ≤ 90"
const SUPERLATIVES_ASSERTION = "no superlatives"
const THREE_ASSERTIONS = [HOOKS_ASSERTION, SUPERLATIVES_ASSERTION, TITLE_ASSERTION] as const
const TWO_ASSERTIONS = [HOOKS_ASSERTION, TITLE_ASSERTION] as const
const MAIN_BRANCH = "main"
const FIX_NODE = "fix_draft"
const SCORE_NODE = "score_hotel"
const BAND_ASSERTION = "score within the expected band"
const BAND_PASS_FROM = 0.7
const BAND_CENTER: Readonly<Record<Band, number>> = { high: 0.85, low: 0.4 }

const PITCH_GOLDEN = datasetId("pitch_golden_v4")
const PREVIOUS_REVISION = revisionId("r41")
const CURRENT_REVISION = revisionId("r42")

const toUsd = (units: number): number => units / USD_UNITS
const unitsOf = (usd: number): number => Math.round(usd * USD_UNITS)
const toSeconds = (tenths: number): number => tenths / TENTHS_PER_SECOND
const tenthsOf = (seconds: number): number => Math.round(seconds * TENTHS_PER_SECOND)
const roundScore = (value: number): number => Math.round(value * SCORE_STEPS) / SCORE_STEPS
const grouped = (value: number): string => value.toLocaleString("en-US")

const rows = (...keys: readonly RowKey[]): readonly RowSpec[] => keys.map((key) => ({ key }))
const PITCH_ROWS: readonly RowSpec[] = rows("call", "agent", "input", "prompt", "output", "postCheck")
const lines = (...texts: readonly string[]): readonly TextLine[] => texts.map((text) => [text])

const beachLabel = (beachM: number): string =>
  beachM >= KILOMETRE ? `beach ${(beachM / KILOMETRE).toFixed(1)} km` : `beach ${String(beachM)} m`

const beachDistance = (beachM: number): string =>
  beachM >= KILOMETRE ? `${(beachM / KILOMETRE).toFixed(1)} km` : `${String(beachM)} m`

const distribute = (total: number, weights: readonly number[]): readonly number[] => {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  const shares = weights.map((weight) => Math.floor((total * weight) / weightSum))
  const remainder = total - shares.reduce((sum, share) => sum + share, 0)
  return shares.map((share, index) => (index === 0 ? share + remainder : share))
}

const jitter = (ordinal: number, index: number, spread: number): number => ((ordinal * (index + 3)) % spread) - Math.floor(spread / 2)

const sumBuilds = (builds: readonly StepBuild[], pick: (build: StepBuild) => number): number =>
  builds.reduce((sum, build) => sum + pick(build), 0)

const BRANCHES: readonly BranchSpec[] = [
  { id: "pitch_gen_a", costUnits: 126, tenths: 24, inputTokens: 1998, outputTokens: 604 },
  { id: "pitch_gen_b", costUnits: 132, tenths: 19, inputTokens: 2014, outputTokens: 512 },
  { id: "pitch_gen_c", costUnits: 104, tenths: 16, inputTokens: 1998, outputTokens: 588 },
  { id: "pitch_gen_d", costUnits: 109, tenths: 21, inputTokens: 1998, outputTokens: 561 },
]

const BRANCH_LETTER: Readonly<Record<BranchId, string>> = { pitch_gen_a: "a", pitch_gen_b: "b", pitch_gen_c: "c", pitch_gen_d: "d" }

const PERSONA_HOOK: Readonly<Record<Persona, string>> = {
  family: "room for the whole family",
  premium: "spa and quiet",
  budget: "more sea for less",
  business: "work by the water",
}

const PERSONA_PERK: Readonly<Record<Persona, string>> = {
  family: "kids club",
  premium: "spa included",
  budget: "price for 3 nights",
  business: "meeting room",
}

const BRANCH_TITLE: Readonly<Record<BranchId, (facts: PitchFacts) => string>> = {
  pitch_gen_a: (facts) => `${facts.hotel}: ${PERSONA_HOOK[facts.persona]}`,
  pitch_gen_b: (facts) => `A ${facts.persona} stay at ${facts.hotel}`,
  pitch_gen_c: (facts) => `Sochi with ${PERSONA_HOOK[facts.persona]}`,
  pitch_gen_d: (facts) => `${beachDistance(facts.beachM)} to the beach from ${facts.hotel}`,
}

const FAILURE: Readonly<Record<FailureKind, (facts: PitchFacts) => FailureSpec>> = {
  hooks: () => ({
    assertion: HOOKS_ASSERTION,
    message: 'hooks[1] = "" → assertion failed',
    output: ["hooks[1] empty", "“…breakfast included,”"],
  }),
  title: (facts) => ({
    assertion: TITLE_ASSERTION,
    message: "title = 104 chars → assertion failed",
    output: ["title 104 chars", `“${facts.hotel}, where the park, the pool and the sea meet for…”`],
  }),
  superlatives: (facts) => ({
    assertion: SUPERLATIVES_ASSERTION,
    message: "“the best” → assertion failed",
    output: ["superlative “the best”", `“The best beach holiday at ${facts.hotel}”`],
  }),
}

const EDITS: readonly string[] = ["3 edits: “perfect” removed, distance added", "1 tone edit", "2 factual edits", "1 length edit"]

const verdictOf = (failure: Failure | null): Verdict => (failure === null ? "pass" : "fail")

const DIVERGE_STAGE = pitchStage("pitch_divergence")
const LOOP_STAGE = pitchStage("critic_loop")
const SCORING_STAGE = pitchStage("hotel_scoring")
const LOAD_STAGE = pitchStage("data_load")

const stageIdentity = (stage: CatalogStage): Pick<StageRun, "id" | "ordinal" | "title"> => ({ id: stage.id, ordinal: stage.number, title: stage.title })

const modelTitleOf = (id: string): NonNullable<AgentCell["title"]> => {
  const node = pitchNode(id)
  return { kind: "model", family: node.model?.family ?? "anthropic", model: node.model?.model ?? "" }
}

const callsOf =
  (scope: string): CallOf =>
  (column) =>
    callId(shortCallId(`${WORKFLOWS.pitchPipeline}/tests/${scope}/${column}`))

const modelAgent = (branch: BranchSpec, costUnits: number, tenths: number, outputTokens: number): AgentCell => ({
  title: modelTitleOf(branch.id),
  costUsd: toUsd(costUnits),
  durationS: toSeconds(tenths),
  tokens: { input: branch.inputTokens, output: outputTokens },
  config: { agent: branch.id, temperature: 0.9, reasoning: "medium" },
})

const closeDelta = (plan: DivergePlan, index: number, branch: BranchSpec): number =>
  branch.id === plan.selected ? roundScore(0.03 + (plan.ordinal % 3) / SCORE_STEPS) : roundScore(0.08 + ((plan.ordinal + index * 3) % 10) / SCORE_STEPS)

const passingCheck = (plan: DivergePlan, index: number, branch: BranchSpec, actual: string): CheckCell => ({
  comparison: { actual, expected: plan.facts.expected, finding: { kind: "close", delta: closeDelta(plan, index, branch) } },
  ratio: { passed: plan.assertions.length, total: plan.assertions.length },
})

const failingCheck = (plan: DivergePlan, spec: FailureSpec): CheckCell => ({
  comparison: { actual: null, expected: plan.facts.expected, finding: { kind: "violation", message: spec.message } },
  checks: plan.assertions.map((name) => ({ name, pass: name !== spec.assertion })),
  judgeCount: 3,
})

const passingOutput = (facts: PitchFacts, title: string): readonly TextLine[] =>
  lines(`“${title}”`, `· rating ${String(facts.rating)}`, `· ${beachLabel(facts.beachM)}`, `· ${PERSONA_PERK[facts.persona]}`)

const branchColumn = (plan: DivergePlan, branch: BranchSpec, index: number): CallColumn & { readonly costUnits: number; readonly tenths: number } => {
  const costUnits = branch.costUnits + jitter(plan.ordinal, index, 9)
  const tenths = branch.tenths + jitter(plan.ordinal, index, 5)
  const outputTokens = branch.outputTokens + jitter(plan.ordinal, index, 11) * 7
  const title = branch.id === plan.selected ? plan.facts.expected : BRANCH_TITLE[branch.id](plan.facts)
  const failing = plan.failure?.branch === branch.id ? FAILURE[plan.failure.kind](plan.facts) : null
  const shared = {
    id: columnId(branch.id),
    callId: plan.callOf(branch.id),
    nodeId: pitchNode(branch.id).id,
    name: branch.id,
    kind: pitchNode(branch.id).kind,
    agent: modelAgent(branch, costUnits, tenths, outputTokens),
    prompt: lines(PITCH_TEMPLATE, `$persona “${plan.facts.persona}”`),
    costUnits,
    tenths,
  }
  if (failing === null) {
    return { ...shared, status: "ok", output: { kind: "lines", lines: passingOutput(plan.facts, title) }, check: passingCheck(plan, index, branch, title) }
  }
  return { ...shared, status: "failed", output: { kind: "lines", lines: lines(...failing.output) }, check: failingCheck(plan, failing) }
}

const withoutBuildFacts = ({ costUnits: _cost, tenths: _tenths, ...column }: CallColumn & { readonly costUnits: number; readonly tenths: number }): CallColumn =>
  column

const sharedPitchInput = (plan: DivergePlan): NonNullable<MatrixGroup["shared"]> => ({
  input: {
    kind: "refs",
    refs: [
      { provenance: "data", label: `hotel ${plan.facts.hotel} · ${String(plan.facts.rating)} · ${grouped(plan.facts.beachM)} m` },
      { provenance: "data", label: `facts.beach_distance_m ${String(plan.facts.beachM)}` },
      { provenance: "knowledge", label: "tone v4" },
    ],
    ...(plan.frozen ? { frozen: true } : {}),
    row: rowId(plan.row),
  },
})

const divergeStep = (plan: DivergePlan): StepBuild => {
  const columns = BRANCHES.map((branch, index) => branchColumn(plan, branch, index))
  const costUnits = columns.reduce((sum, column) => sum + column.costUnits, 0)
  const tenths = Math.max(...columns.map((column) => column.tenths))
  const failure = plan.failure
  return {
    costUnits,
    tenths,
    calls: columns.length,
    stage: {
      ...stageIdentity(DIVERGE_STAGE),
      kind: "diverge",
      fanOut: columns.length,
      description: { kind: "families", count: columns.length, row: rowId(plan.row) },
      costUsd: toUsd(costUnits),
      durationS: toSeconds(tenths),
      groups: [{ id: "pitch_divergence", kind: "diverge", rows: PITCH_ROWS, columns: columns.map(withoutBuildFacts), shared: sharedPitchInput(plan) }],
      join: {
        selected: nodeId(plan.selected),
        score: roundScore(0.72 + ((plan.ordinal * 7) % 20) / SCORE_STEPS),
        dropped: failure === null ? [] : [{ branch: BRANCH_LETTER[failure.branch], billed: true }],
      },
    },
  }
}

const judgeSplit = (total: number): readonly number[] => {
  const first = Math.round(total * JUDGE_SHARES[0])
  const second = Math.round(total * JUDGE_SHARES[1])
  return [first, second, total - first - second]
}

const loopScore = (plan: LoopPlan, iteration: number): number => roundScore(plan.finalScore - (plan.iterations - iteration) * LOOP_SCORE_STEP)

const iterationInput = (plan: LoopPlan, iteration: number): ProvenancedValue =>
  iteration === 1 ? plan.firstInput : { provenance: "generated", label: `draft·v${String(iteration)}`, value: `fix_draft it.${String(iteration - 1)}` }

const iterationOutput = (plan: LoopPlan, iteration: number): string =>
  iteration === plan.iterations
    ? `draft·v${String(iteration)} accepted · quorum 2/3`
    : `draft·v${String(iteration + 1)} — ${EDITS[(iteration - 1) % EDITS.length] ?? ""}`

const iterationCheck = (plan: LoopPlan, iteration: number): CheckCell => {
  const last = iteration === plan.iterations
  return {
    score: {
      value: loopScore(plan, iteration),
      threshold: THRESHOLD,
      ...(iteration === 1 ? {} : { previous: loopScore(plan, iteration - 1) }),
      ...(last ? { expectedDelta: plan.expectedDelta } : {}),
    },
  }
}

const iterationColumn = (plan: LoopPlan, iteration: number, { costUnits, tenths, calls }: IterationBudget): CallColumn => {
  const last = iteration === plan.iterations
  const judgesUnits = last ? costUnits : Math.round(costUnits * JUDGE_SHARE_OF_ITERATION)
  const fixUnits = last ? null : costUnits - judgesUnits
  return {
    id: columnId(`iteration_${String(iteration)}`),
    callId: plan.callOf(`critic_loop_${String(iteration)}`),
    nodeId: pitchNode(FIX_NODE).id,
    name: `iteration ${String(iteration)}`,
    flags: last ? ["loopBody", "best"] : ["loopBody"],
    agent: {
      title: { kind: "panel", families: PANEL_FAMILIES, judges: 3, fix: !last },
      breakdown: { judgesUsd: judgeSplit(judgesUnits).map(toUsd), fixUsd: fixUnits === null ? null : toUsd(fixUnits) },
      costUsd: toUsd(costUnits),
      durationS: toSeconds(tenths),
      calls,
      config: { agent: "iteration", temperature: 0.9, reasoning: "medium" },
    },
    input: { kind: "refs", refs: [iterationInput(plan, iteration)] },
    prompt: LOOP_PROMPT,
    output: { kind: "lines", lines: lines(iterationOutput(plan, iteration)) },
    check: iterationCheck(plan, iteration),
  }
}

const loopWeights = (iterations: number, weight: { readonly body: number; readonly last: number }): readonly number[] =>
  Array.from({ length: iterations }, (_, index) => (index === iterations - 1 ? weight.last : weight.body))

const panelCalls = (iterations: number): readonly number[] => loopWeights(iterations, PANEL_CALLS)

const spreadCalls = (total: number, iterations: number): readonly number[] => {
  const share = Math.floor(total / iterations)
  return loopWeights(iterations, { body: share, last: total - share * (iterations - 1) })
}

const loopStep = (plan: LoopPlan): StepBuild => {
  const costs = distribute(plan.costUnits, loopWeights(plan.iterations, COST_WEIGHT))
  const durations = distribute(plan.tenths, loopWeights(plan.iterations, TENTHS_WEIGHT))
  const columns = costs.map((cost, index) =>
    iterationColumn(plan, index + 1, { costUnits: cost, tenths: durations[index] ?? 0, calls: plan.iterationCalls[index] ?? 0 }),
  )
  const calls = columns.reduce((sum, column) => sum + (column.agent?.calls ?? 0), 0)
  return {
    costUnits: plan.costUnits,
    tenths: plan.tenths,
    calls,
    stage: {
      ...stageIdentity(LOOP_STAGE),
      kind: "loop",
      fanOut: plan.iterations,
      description: { kind: "loop", body: LOOP_BODY, exit: { kind: "threshold", value: THRESHOLD } },
      costUsd: toUsd(plan.costUnits),
      durationS: toSeconds(plan.tenths),
      groups: [{ id: "critic_loop", kind: "loop", rows: PITCH_ROWS, columns }],
      exit: {
        conditions: [
          { kind: "threshold", score: plan.finalScore, target: THRESHOLD, afterFix: plan.iterations > 1, fired: true },
          { kind: "iterations", used: plan.iterations, max: MAX_ITERATIONS, fired: false },
          { kind: "budget", spentUsd: toUsd(plan.costUnits), limitUsd: BUDGET_LIMIT_USD, fired: false },
        ],
      },
    },
  }
}

const outcomeOf = (failure: Failure | null, failed: FailureSpec | null, branch: string, costUnits: number, calls: number): RowOutcome => ({
  verdict: verdictOf(failure),
  failedAssertion: failed?.assertion ?? "",
  branch,
  totalCostUsd: toUsd(costUnits),
  calls,
})

const PITCH_COLUMNS: readonly DatasetColumn[] = [
  { key: "hotel.name", label: "hotel.name" },
  { key: "rating", label: "rating" },
  { key: "beach_m", label: "beach_m" },
  { key: "persona", label: "persona" },
  { key: "expected.title", label: "expected title" },
]

const pitchDatasetRow = (base: RowBase, facts: PitchFacts, assertions: number, verdict: Verdict): DatasetRow => ({
  id: rowId(base.id),
  ordinal: base.ordinal,
  values: { "hotel.name": facts.hotel, rating: facts.rating, beach_m: facts.beachM, persona: facts.persona, "expected.title": facts.expected },
  assertionCount: assertions,
  verdict,
  context: [facts.hotel, facts.persona, beachLabel(facts.beachM)],
})

type PitchRow = RowBase & { readonly facts: PitchFacts; readonly assertions: readonly string[] }

type PitchRowId = "07" | "12" | "19" | "24" | "33" | "41" | "46"

const PITCH_DATASET: Readonly<Record<PitchRowId, PitchRow>> = {
  "07": { id: "07", ordinal: 7, facts: { hotel: "Marins", rating: 3.9, beachM: 2100, persona: "family", expected: "A holiday next to the park" }, assertions: THREE_ASSERTIONS },
  "12": { id: "12", ordinal: 12, facts: { hotel: "Rodina Grand", rating: 4.8, beachM: 240, persona: "premium", expected: "Quiet and spa two steps away" }, assertions: THREE_ASSERTIONS },
  "19": { id: "19", ordinal: 19, facts: { hotel: "Sea Galaxy", rating: 4.5, beachM: 900, persona: "budget", expected: "Sochi without overpaying" }, assertions: TWO_ASSERTIONS },
  "24": { id: "24", ordinal: 24, facts: { hotel: "Bridge Resort", rating: 4.6, beachM: 1400, persona: "family", expected: "Park, pool, quiet" }, assertions: THREE_ASSERTIONS },
  "33": { id: "33", ordinal: 33, facts: { hotel: "Bridge Resort", rating: 4.6, beachM: 240, persona: "budget", expected: "240 m to beach" }, assertions: TWO_ASSERTIONS },
  "41": { id: "41", ordinal: 41, facts: { hotel: "Rodina Grand", rating: 4.8, beachM: 240, persona: "business", expected: "Negotiations by the sea" }, assertions: THREE_ASSERTIONS },
  "46": { id: "46", ordinal: 46, facts: { hotel: "Marins", rating: 3.9, beachM: 2100, persona: "business", expected: "Meeting room and late checkout" }, assertions: THREE_ASSERTIONS },
}

const PITCH_GOLDEN_SOURCE: DatasetSource = { kind: "spreadsheet", agentExtended: true }

const pitchCall = (row: string): CallOf => callsOf(`pitch_gen_b/${row}`)

const ROW_07_TRACE: RowTrace = {
  rowId: rowId("07"),
  steps: [
    {
      ...stageIdentity(DIVERGE_STAGE),
      kind: "diverge",
      fanOut: 4,
      description: { kind: "families", count: 4, row: rowId("07") },
      costUsd: 0.0471,
      durationS: 2.4,
      groups: [
        {
          id: "pitch_divergence",
          kind: "diverge",
          rows: PITCH_ROWS,
          shared: {
            input: {
              kind: "refs",
              refs: [
                { provenance: "data", label: "hotel Marins · 3.9 · 2,100 m" },
                { provenance: "data", label: "facts.beach_distance_m 2100" },
                { provenance: "knowledge", label: "tone v4" },
              ],
              frozen: true,
              row: rowId("07"),
            },
          },
          columns: [
            {
              id: columnId("pitch_gen_a"),
              callId: pitchCall("07")("pitch_gen_a"),
              nodeId: pitchNode("pitch_gen_a").id,
              name: "pitch_gen_a",
              kind: pitchNode("pitch_gen_a").kind,
              status: "ok",
              agent: { title: modelTitleOf("pitch_gen_a"), costUsd: 0.0126, durationS: 2.4, tokens: { input: 1998, output: 604 }, config: { agent: "pitch_gen_a", temperature: 0.9, reasoning: "medium" } },
              prompt: lines(PITCH_TEMPLATE, "$persona “premium”"),
              output: { kind: "lines", lines: lines("“Park, spa and quiet”", "· 12 ha park", "· 1,200 m² spa", "· breakfast included") },
              check: {
                comparison: { actual: "Park, spa and quiet", expected: "A holiday next to the park", finding: { kind: "close", delta: 0.12 } },
                ratio: { passed: 3, total: 3 },
              },
            },
            {
              id: columnId("pitch_gen_b"),
              callId: callId("call_01HT9"),
              nodeId: pitchNode("pitch_gen_b").id,
              name: "pitch_gen_b",
              kind: pitchNode("pitch_gen_b").kind,
              status: "failed",
              agent: { title: modelTitleOf("pitch_gen_b"), costUsd: 0.0132, durationS: 1.9, tokens: { input: 2014, output: 512 }, config: { agent: "pitch_gen_b", temperature: 0.9, reasoning: "medium" } },
              prompt: lines(PITCH_TEMPLATE, "$persona «family»"),
              output: { kind: "lines", lines: lines("hooks[2] empty", "“…breakfast included,”") },
              check: {
                comparison: { actual: null, expected: "A holiday next to the park", finding: { kind: "violation", message: 'hooks[2] = "" → assertion failed' } },
                checks: [
                  { name: HOOKS_ASSERTION, pass: false },
                  { name: SUPERLATIVES_ASSERTION, pass: true },
                  { name: TITLE_ASSERTION, pass: true },
                ],
                judgeCount: 3,
              },
            },
            {
              id: columnId("pitch_gen_c"),
              callId: pitchCall("07")("pitch_gen_c"),
              nodeId: pitchNode("pitch_gen_c").id,
              name: "pitch_gen_c",
              kind: pitchNode("pitch_gen_c").kind,
              status: "ok",
              agent: { title: modelTitleOf("pitch_gen_c"), costUsd: 0.0104, durationS: 1.6, tokens: { input: 1998, output: 588 }, config: { agent: "pitch_gen_c", temperature: 0.9, reasoning: "medium" } },
              prompt: lines(PITCH_TEMPLATE, "$persona “budget”"),
              output: { kind: "lines", lines: lines("“A family break without overpaying”", "· price for 3 nights", "· kids club", "· transfer") },
              check: {
                comparison: { actual: "A family break without overpaying", expected: "A holiday next to the park", finding: { kind: "close", delta: 0.09 } },
                ratio: { passed: 3, total: 3 },
              },
            },
            {
              id: columnId("pitch_gen_d"),
              callId: pitchCall("07")("pitch_gen_d"),
              nodeId: pitchNode("pitch_gen_d").id,
              name: "pitch_gen_d",
              kind: pitchNode("pitch_gen_d").kind,
              status: "ok",
              agent: { title: modelTitleOf("pitch_gen_d"), costUsd: 0.0109, durationS: 2.1, tokens: { input: 1998, output: 561 }, config: { agent: "pitch_gen_d", temperature: 0.9, reasoning: "medium" } },
              prompt: lines(PITCH_TEMPLATE, "$persona “business”"),
              output: { kind: "lines", lines: lines("“A work trip with the family”", "· room for 20", "· 2.1 km to beach", "· late checkout") },
              check: {
                comparison: { actual: "A work trip with the family", expected: "A holiday next to the park", finding: { kind: "close", delta: 0.17 } },
                ratio: { passed: 3, total: 3 },
              },
            },
          ],
        },
      ],
      join: { selected: nodeId("pitch_gen_c"), score: 0.81, dropped: [{ branch: "b", billed: true }] },
    },
    {
      ...stageIdentity(LOOP_STAGE),
      kind: "loop",
      fanOut: 3,
      description: { kind: "loop", body: LOOP_BODY, exit: { kind: "threshold", value: THRESHOLD } },
      costUsd: 0.1201,
      durationS: 5.5,
      groups: [
        {
          id: "critic_loop",
          kind: "loop",
          rows: PITCH_ROWS,
          columns: [
            {
              id: columnId("iteration_1"),
              callId: pitchCall("07")("critic_loop_1"),
              nodeId: pitchNode(FIX_NODE).id,
              name: "iteration 1",
              flags: ["loopBody"],
              agent: {
                title: { kind: "panel", families: PANEL_FAMILIES, judges: 3, fix: true },
                breakdown: { judgesUsd: [0.0118, 0.004, 0.0036], fixUsd: 0.0298 },
                costUsd: 0.0492,
                durationS: 2,
                calls: 4,
                config: { agent: "iteration", temperature: 0.9, reasoning: "medium" },
              },
              input: { kind: "refs", refs: [{ provenance: "generated", label: "draft·v1", value: "pitch_gen_c" }] },
              prompt: LOOP_PROMPT,
              output: { kind: "lines", lines: lines("draft·v2 — 3 edits: “perfect” removed, 2.1 km added") },
              check: { score: { value: 0.58, threshold: THRESHOLD } },
            },
            {
              id: columnId("iteration_2"),
              callId: pitchCall("07")("critic_loop_2"),
              nodeId: pitchNode(FIX_NODE).id,
              name: "iteration 2",
              flags: ["loopBody"],
              agent: {
                title: { kind: "panel", families: PANEL_FAMILIES, judges: 3, fix: true },
                breakdown: { judgesUsd: [0.0121, 0.0041, 0.0037], fixUsd: 0.0305 },
                costUsd: 0.0504,
                durationS: 2.1,
                calls: 4,
                config: { agent: "iteration", temperature: 0.9, reasoning: "medium" },
              },
              input: { kind: "refs", refs: [{ provenance: "generated", label: "draft·v2", value: "fix_draft it.1" }] },
              prompt: LOOP_PROMPT,
              output: { kind: "lines", lines: lines("draft·v3 — 1 tone edit") },
              check: { score: { value: 0.77, previous: 0.58, threshold: THRESHOLD } },
            },
            {
              id: columnId("iteration_3"),
              callId: pitchCall("07")("critic_loop_3"),
              nodeId: pitchNode(FIX_NODE).id,
              name: "iteration 3",
              flags: ["loopBody", "best"],
              agent: {
                title: { kind: "panel", families: PANEL_FAMILIES, judges: 3, fix: true },
                breakdown: { judgesUsd: [0.0124, 0.0043, 0.0038], fixUsd: null },
                costUsd: 0.0205,
                durationS: 1.4,
                calls: 3,
                config: { agent: "iteration", temperature: 0.9, reasoning: "medium" },
              },
              input: { kind: "refs", refs: [{ provenance: "generated", label: "draft·v3", value: "fix_draft it.2" }] },
              prompt: LOOP_PROMPT,
              output: { kind: "lines", lines: lines("draft·v3 accepted · quorum 2/3") },
              check: { score: { value: 0.88, previous: 0.77, threshold: THRESHOLD, expectedDelta: 0.04 } },
            },
          ],
        },
      ],
      exit: {
        conditions: [
          { kind: "threshold", score: 0.88, target: THRESHOLD, afterFix: true, fired: true },
          { kind: "iterations", used: 3, max: MAX_ITERATIONS, fired: false },
          { kind: "budget", spentUsd: 0.12, limitUsd: BUDGET_LIMIT_USD, fired: false },
        ],
      },
    },
  ],
  outcome: { verdict: "fail", failedAssertion: HOOKS_ASSERTION, branch: "b", totalCostUsd: 0.1672, calls: 11 },
}

type SliceRun = {
  readonly id: PitchRowId
  readonly selected: BranchId
  readonly iterations: number
  readonly calls: number
  readonly costUsd: number
  readonly durationS: number
  readonly delta: number
  readonly failure: Failure | null
  readonly finalScore: number
}

const PITCH_GEN_B_RUNS: readonly SliceRun[] = [
  { id: "07", selected: "pitch_gen_c", iterations: 3, calls: 11, costUsd: 0.1672, durationS: 7.9, delta: 0.22, failure: { branch: "pitch_gen_b", kind: "hooks" }, finalScore: 0.88 },
  { id: "12", selected: "pitch_gen_a", iterations: 2, calls: 8, costUsd: 0.1204, durationS: 5.8, delta: 0.03, failure: null, finalScore: 0.92 },
  { id: "19", selected: "pitch_gen_d", iterations: 4, calls: 14, costUsd: 0.2015, durationS: 9.6, delta: 0.14, failure: { branch: "pitch_gen_a", kind: "title" }, finalScore: 0.91 },
  { id: "24", selected: "pitch_gen_c", iterations: 2, calls: 8, costUsd: 0.1188, durationS: 5.6, delta: 0.05, failure: null, finalScore: 0.94 },
  { id: "33", selected: "pitch_gen_b", iterations: 3, calls: 11, costUsd: 0.1649, durationS: 7.7, delta: 0.31, failure: { branch: "pitch_gen_c", kind: "hooks" }, finalScore: 0.93 },
  { id: "41", selected: "pitch_gen_a", iterations: 4, calls: 14, costUsd: 0.1972, durationS: 9.4, delta: 0.09, failure: { branch: "pitch_gen_b", kind: "superlatives" }, finalScore: 0.91 },
  { id: "46", selected: "pitch_gen_d", iterations: 1, calls: 5, costUsd: 0.0904, durationS: 4.2, delta: 0.02, failure: null, finalScore: 0.91 },
]

const resultOf = (id: string, verdict: Verdict, selected: string, facts: Omit<RowResult, "rowId" | "verdict" | "selectedBranch">): RowResult => ({
  rowId: rowId(id),
  verdict,
  selectedBranch: nodeId(selected),
  ...facts,
})

const failedSpecOf = (failure: Failure | null, facts: PitchFacts): FailureSpec | null => (failure === null ? null : FAILURE[failure.kind](facts))

const outcomeBranch = (run: { readonly failure: Failure | null; readonly selected: BranchId }): string =>
  BRANCH_LETTER[run.failure?.branch ?? run.selected]

const divergePlanOf = (row: PitchRow, run: { readonly selected: BranchId; readonly failure: Failure | null }, callOf: CallOf, frozen: boolean): DivergePlan => ({
  callOf,
  row: row.id,
  ordinal: row.ordinal,
  facts: row.facts,
  assertions: row.assertions,
  selected: run.selected,
  failure: run.failure,
  frozen,
})

const pitchSliceTrace = (run: SliceRun): RowTrace => {
  const row = PITCH_DATASET[run.id]
  const callOf = pitchCall(run.id)
  const diverge = divergeStep(divergePlanOf(row, run, callOf, true))
  const loop = loopStep({
    callOf,
    iterations: run.iterations,
    iterationCalls: spreadCalls(run.calls - diverge.calls, run.iterations),
    costUnits: unitsOf(run.costUsd) - diverge.costUnits,
    tenths: tenthsOf(run.durationS) - diverge.tenths,
    finalScore: run.finalScore,
    expectedDelta: run.delta,
    firstInput: { provenance: "generated", label: "draft·v1", value: run.selected },
  })
  return {
    rowId: rowId(run.id),
    steps: [diverge.stage, loop.stage],
    outcome: outcomeOf(run.failure, failedSpecOf(run.failure, row.facts), outcomeBranch(run), unitsOf(run.costUsd), sumBuilds([diverge, loop], (build) => build.calls)),
  }
}

const pitchGenBRecord = (run: SliceRun): RowRecord => {
  const row = PITCH_DATASET[run.id]
  const verdict = verdictOf(run.failure)
  return {
    row: pitchDatasetRow(row, row.facts, row.assertions.length, verdict),
    result: resultOf(run.id, verdict, run.selected, { iterations: run.iterations, calls: run.calls, costUsd: run.costUsd, durationS: run.durationS, delta: run.delta }),
    trace: run.id === "07" ? ROW_07_TRACE : pitchSliceTrace(run),
  }
}

const history = (previous: readonly [number, number, number], current: readonly [number, number, number], changeSummary: string): RunHistory => ({
  previous: { revision: PREVIOUS_REVISION, draft: false, pass: { passed: previous[0], total: previous[1] }, costUsd: previous[2] },
  current: { revision: CURRENT_REVISION, draft: true, pass: { passed: current[0], total: current[1] }, costUsd: current[2] },
  changeSummary,
})

const summaryOf = (rowsTotal: number, passed: number, costUsd: number, durationS: number, passDelta: number): TestRunSummary => ({
  rows: rowsTotal,
  passed,
  costUsd,
  durationS,
  passDelta,
})

const PITCH_GEN_B: TestFixture = {
  detail: {
    id: testId("pitch_gen_b"),
    target: { nodeId: nodeId("pitch_gen_b"), kind: "llm" },
    stage: { index: DIVERGE_STAGE.number, name: "divergence", stageId: DIVERGE_STAGE.id },
    frozenAncestorCount: 4,
    promptSource: { draftRevision: CURRENT_REVISION, cassette: false },
    summary: summaryOf(48, 44, 0.6104, 92, 3),
    dataset: { id: PITCH_GOLDEN, rowCount: 48, assertionCount: 3, source: PITCH_GOLDEN_SOURCE, columns: PITCH_COLUMNS },
    runHistory: history([41, 48, 0.58], [44, 48, 0.61], "three truncated gone, facts and superlatives remain"),
  },
  records: PITCH_GEN_B_RUNS.map(pitchGenBRecord),
}

type StageRunPlan = { readonly id: PitchRowId; readonly selected: BranchId; readonly failure: Failure | null; readonly delta: number }

const DIVERGE_STAGE_RUNS: readonly StageRunPlan[] = [
  { id: "07", selected: "pitch_gen_c", failure: { branch: "pitch_gen_b", kind: "hooks" }, delta: 0.21 },
  { id: "12", selected: "pitch_gen_a", failure: null, delta: 0.04 },
  { id: "19", selected: "pitch_gen_d", failure: { branch: "pitch_gen_a", kind: "title" }, delta: 0.16 },
  { id: "24", selected: "pitch_gen_c", failure: { branch: "pitch_gen_d", kind: "superlatives" }, delta: 0.11 },
  { id: "33", selected: "pitch_gen_b", failure: { branch: "pitch_gen_c", kind: "hooks" }, delta: 0.29 },
  { id: "41", selected: "pitch_gen_a", failure: { branch: "pitch_gen_b", kind: "superlatives" }, delta: 0.12 },
  { id: "46", selected: "pitch_gen_d", failure: null, delta: 0.03 },
]

const divergeStageRecord = (run: StageRunPlan): RowRecord => {
  const row = PITCH_DATASET[run.id]
  const verdict = verdictOf(run.failure)
  const diverge = divergeStep(divergePlanOf(row, run, callsOf(`diverge_stage_4/${run.id}`), true))
  return {
    row: pitchDatasetRow(row, row.facts, row.assertions.length, verdict),
    result: resultOf(run.id, verdict, run.selected, {
      iterations: 1,
      calls: diverge.calls,
      costUsd: toUsd(diverge.costUnits),
      durationS: toSeconds(diverge.tenths),
      delta: run.delta,
    }),
    trace: {
      rowId: rowId(run.id),
      steps: [diverge.stage],
      outcome: outcomeOf(run.failure, failedSpecOf(run.failure, row.facts), outcomeBranch(run), diverge.costUnits, diverge.calls),
    },
  }
}

const DIVERGE_STAGE_4: TestFixture = {
  detail: {
    id: testId("diverge_stage_4"),
    target: { nodeId: nodeId("pitch_divergence"), kind: "llm" },
    stage: { index: DIVERGE_STAGE.number, name: "diverge", stageId: DIVERGE_STAGE.id },
    frozenAncestorCount: 4,
    promptSource: { draftRevision: CURRENT_REVISION, cassette: false },
    summary: summaryOf(48, 41, 2.2608, 118, 3),
    dataset: { id: PITCH_GOLDEN, rowCount: 48, assertionCount: 3, source: PITCH_GOLDEN_SOURCE, columns: PITCH_COLUMNS },
    runHistory: history([38, 48, 2.31], [41, 48, 2.26], "branch b falls back to mini instead of truncating"),
  },
  records: DIVERGE_STAGE_RUNS.map(divergeStageRecord),
}

type LoopRow = RowBase & {
  readonly candidate: string
  readonly persona: Persona
  readonly facts: number
  readonly minScore: number
  readonly iterations: number
  readonly costUnits: number
  readonly tenths: number
  readonly finalScore: number
}

const LOOP_COLUMNS: readonly DatasetColumn[] = [
  { key: "candidate", label: "candidate" },
  { key: "persona", label: "persona" },
  { key: "facts", label: "facts" },
  { key: "expected.min_score", label: "expected min score" },
]

const LOOP_ROWS: readonly LoopRow[] = [
  { id: "01", ordinal: 1, candidate: "Negotiations by the sea", persona: "business", facts: 6, minScore: THRESHOLD, iterations: 2, costUnits: 1880, tenths: 42, finalScore: 0.92 },
  { id: "04", ordinal: 4, candidate: "Park, pool, quiet", persona: "family", facts: 5, minScore: THRESHOLD, iterations: 3, costUnits: 2710, tenths: 61, finalScore: 0.91 },
  { id: "09", ordinal: 9, candidate: "Sochi without overpaying", persona: "budget", facts: 4, minScore: THRESHOLD, iterations: 1, costUnits: 890, tenths: 19, finalScore: 0.93 },
  { id: "13", ordinal: 13, candidate: "Quiet and spa two steps away", persona: "premium", facts: 7, minScore: THRESHOLD, iterations: 2, costUnits: 1905, tenths: 44, finalScore: 0.94 },
  { id: "18", ordinal: 18, candidate: "A holiday next to the park", persona: "family", facts: 5, minScore: THRESHOLD, iterations: 3, costUnits: 2640, tenths: 63, finalScore: 0.9 },
]

const loopRecord = (row: LoopRow): RowRecord => {
  const delta = roundScore(row.finalScore - row.minScore)
  const loop = loopStep({
    callOf: callsOf(`critic_loop_stage_5/${row.id}`),
    iterations: row.iterations,
    iterationCalls: panelCalls(row.iterations),
    costUnits: row.costUnits,
    tenths: row.tenths,
    finalScore: row.finalScore,
    expectedDelta: delta,
    firstInput: { provenance: "data", label: "draft·v1", value: `row #${row.id}` },
  })
  return {
    row: {
      id: rowId(row.id),
      ordinal: row.ordinal,
      values: { candidate: row.candidate, persona: row.persona, facts: row.facts, "expected.min_score": row.minScore },
      assertionCount: 4,
      verdict: "pass",
      context: [row.candidate, row.persona, `${String(row.facts)} facts`],
    },
    result: resultOf(row.id, "pass", FIX_NODE, {
      iterations: row.iterations,
      calls: loop.calls,
      costUsd: toUsd(loop.costUnits),
      durationS: toSeconds(loop.tenths),
      delta,
    }),
    trace: { rowId: rowId(row.id), steps: [loop.stage], outcome: outcomeOf(null, null, MAIN_BRANCH, loop.costUnits, loop.calls) },
  }
}

const CRITIC_LOOP_STAGE_5: TestFixture = {
  detail: {
    id: testId("critic_loop_stage_5"),
    target: { nodeId: nodeId("critic_loop"), kind: "llm" },
    stage: { index: LOOP_STAGE.number, name: "critic_loop", stageId: LOOP_STAGE.id },
    frozenAncestorCount: 8,
    promptSource: { draftRevision: CURRENT_REVISION, cassette: false },
    summary: summaryOf(20, 20, 4.0312, 96, 1),
    dataset: { id: datasetId("loop_regress"), rowCount: 20, assertionCount: 4, source: { kind: "spreadsheet", agentExtended: false }, columns: LOOP_COLUMNS },
    runHistory: history([19, 20, 4.18], [20, 20, 4.03], "fix prompt v4 closes the last stagnating candidate"),
  },
  records: LOOP_ROWS.map(loopRecord),
}

type HotelRow = RowBase & {
  readonly hotel: string
  readonly rating: number
  readonly beachM: number
  readonly reviews: number
  readonly band: Band
  readonly score: number
  readonly remark: string
  readonly costUnits: number
  readonly tenths: number
  readonly tokens: { readonly input: number; readonly output: number }
}

const HOTEL_COLUMNS: readonly DatasetColumn[] = [
  { key: "hotel.name", label: "hotel.name" },
  { key: "rating", label: "rating" },
  { key: "beach_m", label: "beach_m" },
  { key: "reviews", label: "reviews" },
  { key: "band", label: "expected band" },
]

const HOTEL_ROWS: readonly HotelRow[] = [
  { id: "003", ordinal: 3, hotel: "Rodina Grand", rating: 4.8, beachM: 240, reviews: 1312, band: "high", score: 0.93, remark: "beach nearby, spa, quiet", costUnits: 19, tenths: 3, tokens: { input: 812, output: 104 } },
  { id: "017", ordinal: 17, hotel: "Sea Galaxy", rating: 4.5, beachM: 900, reviews: 866, band: "high", score: 0.88, remark: "big pool, kids club", costUnits: 21, tenths: 3, tokens: { input: 844, output: 112 } },
  { id: "042", ordinal: 42, hotel: "Marins", rating: 3.9, beachM: 2100, reviews: 402, band: "low", score: 0.44, remark: "noisy area, renovation", costUnits: 18, tenths: 3, tokens: { input: 798, output: 96 } },
  { id: "118", ordinal: 118, hotel: "Bridge Resort", rating: 4.6, beachM: 1400, reviews: 951, band: "high", score: 0.52, remark: "far from the sea, a park only", costUnits: 18, tenths: 3, tokens: { input: 801, output: 98 } },
  { id: "256", ordinal: 256, hotel: "Pine Ridge Lodge", rating: 4.2, beachM: 1800, reviews: 210, band: "low", score: 0.39, remark: "remote, quiet forest", costUnits: 17, tenths: 2, tokens: { input: 776, output: 91 } },
  { id: "431", ordinal: 431, hotel: "Bella Vista Resort", rating: 4.4, beachM: 240, reviews: 588, band: "high", score: 0.61, remark: "small rooms, great view", costUnits: 20, tenths: 4, tokens: { input: 830, output: 108 } },
]

const BAND_HOLDS: Readonly<Record<Band, (score: number) => boolean>> = {
  high: (score) => score >= BAND_PASS_FROM,
  low: (score) => score < BAND_PASS_FROM,
}

const hotelCheck = (row: HotelRow, pass: boolean): CheckCell =>
  pass
    ? { score: { value: row.score }, ratio: { passed: 1, total: 1 } }
    : { score: { value: row.score }, checks: [{ name: BAND_ASSERTION, pass: false }], note: { text: `expected ${row.band} · got ${row.score.toFixed(2)}`, pass: false } }

const scoreStep = (row: HotelRow, pass: boolean): StepBuild => ({
  costUnits: row.costUnits,
  tenths: row.tenths,
  calls: 1,
  stage: {
    ...stageIdentity(SCORING_STAGE),
    kind: "seq",
    description: { kind: "text", text: "one map item · the hotel comes from the dataset row" },
    costUsd: toUsd(row.costUnits),
    durationS: toSeconds(row.tenths),
    groups: [
      {
        id: "hotel_scoring",
        kind: "seq",
        rows: PITCH_ROWS,
        columns: [
          {
            id: columnId(SCORE_NODE),
            callId: callsOf(`score_hotel/${row.id}`)(SCORE_NODE),
            nodeId: pitchNode(SCORE_NODE).id,
            name: SCORE_NODE,
            kind: pitchNode(SCORE_NODE).kind,
            status: pass ? "ok" : "failed",
            subtitle: row.hotel,
            agent: {
              title: modelTitleOf(SCORE_NODE),
              costUsd: toUsd(row.costUnits),
              durationS: toSeconds(row.tenths),
              tokens: row.tokens,
              config: { agent: SCORE_NODE, temperature: 0.2, reasoning: "off" },
            },
            input: { kind: "refs", refs: [{ provenance: "data", label: "hotel · Hotel" }], note: `rating ${String(row.rating)} · ${beachDistance(row.beachM)}` },
            prompt: [["score_v3 · 2 slots: ", { text: "$hotel", mark: "data" }, " ", { text: "$criteria", mark: "static" }]],
            output: { kind: "lines", lines: lines(`value: ${row.score.toFixed(2)}`, `“${row.remark}”`) },
            check: hotelCheck(row, pass),
          },
        ],
      },
    ],
  },
})

const hotelRecord = (row: HotelRow): RowRecord => {
  const pass = BAND_HOLDS[row.band](row.score)
  const verdict: Verdict = pass ? "pass" : "fail"
  const step = scoreStep(row, pass)
  return {
    row: {
      id: rowId(row.id),
      ordinal: row.ordinal,
      values: { "hotel.name": row.hotel, rating: row.rating, beach_m: row.beachM, reviews: row.reviews, band: row.band },
      assertionCount: 1,
      verdict,
      context: [row.hotel, `rating ${String(row.rating)}`, beachLabel(row.beachM)],
    },
    result: resultOf(row.id, verdict, SCORE_NODE, {
      iterations: 1,
      calls: step.calls,
      costUsd: toUsd(step.costUnits),
      durationS: toSeconds(step.tenths),
      delta: roundScore(Math.abs(row.score - BAND_CENTER[row.band])),
    }),
    trace: {
      rowId: rowId(row.id),
      steps: [step.stage],
      outcome: { verdict, failedAssertion: pass ? "" : BAND_ASSERTION, branch: MAIN_BRANCH, totalCostUsd: toUsd(step.costUnits), calls: step.calls },
    },
  }
}

const SCORE_HOTEL: TestFixture = {
  detail: {
    id: testId("score_hotel"),
    target: { nodeId: nodeId(SCORE_NODE), kind: "llm" },
    stage: { index: SCORING_STAGE.number, name: "map", stageId: SCORING_STAGE.id },
    frozenAncestorCount: 1,
    promptSource: { draftRevision: CURRENT_REVISION, cassette: true },
    summary: summaryOf(500, 486, 0.9512, 162, 0),
    dataset: { id: datasetId("hotels_500"), rowCount: 500, assertionCount: 1, source: { kind: "tool", adapter: "hotels.search" }, columns: HOTEL_COLUMNS },
    runHistory: history([486, 500, 0.95], [486, 500, 0.95], "no scorer change — replayed from the cassette"),
  },
  records: HOTEL_ROWS.map(hotelRecord),
}

type SmokeRow = RowBase & {
  readonly city: string
  readonly nights: number
  readonly brief: string
  readonly pitch: PitchRow
  readonly selected: BranchId
  readonly failure: Failure | null
  readonly iterations: number
  readonly loopCostUnits: number
  readonly loopTenths: number
  readonly finalScore: number
  readonly delta: number
}

const SMOKE_COLUMNS: readonly DatasetColumn[] = [
  { key: "city", label: "city" },
  { key: "nights", label: "nights" },
  { key: "persona", label: "persona" },
  { key: "brief", label: "brief" },
  { key: "expected.title", label: "expected title" },
]

const LOAD_TENTHS = 19

const smokePitch = (id: string, ordinal: number, facts: PitchFacts): PitchRow => ({ id, ordinal, facts, assertions: THREE_ASSERTIONS })

const SMOKE_ROWS: readonly SmokeRow[] = [
  {
    id: "01",
    ordinal: 1,
    city: "Sochi",
    nights: 3,
    brief: "no nightclubs",
    pitch: smokePitch("01", 1, { hotel: "Rodina Grand", rating: 4.8, beachM: 240, persona: "family", expected: "A holiday next to the park" }),
    selected: "pitch_gen_c",
    failure: null,
    iterations: 2,
    loopCostUnits: 1010,
    loopTenths: 41,
    finalScore: 0.92,
    delta: 0.04,
  },
  {
    id: "04",
    ordinal: 4,
    city: "Sochi",
    nights: 5,
    brief: "late checkout",
    pitch: smokePitch("04", 4, { hotel: "Sea Galaxy", rating: 4.5, beachM: 900, persona: "business", expected: "Negotiations by the sea" }),
    selected: "pitch_gen_d",
    failure: { branch: "pitch_gen_a", kind: "title" },
    iterations: 3,
    loopCostUnits: 1480,
    loopTenths: 58,
    finalScore: 0.91,
    delta: 0.18,
  },
  {
    id: "07",
    ordinal: 7,
    city: "Adler",
    nights: 2,
    brief: "no pets",
    pitch: smokePitch("07", 7, { hotel: "Bridge Resort", rating: 4.6, beachM: 1400, persona: "budget", expected: "Sochi without overpaying" }),
    selected: "pitch_gen_a",
    failure: null,
    iterations: 1,
    loopCostUnits: 420,
    loopTenths: 17,
    finalScore: 0.93,
    delta: 0.02,
  },
  {
    id: "11",
    ordinal: 11,
    city: "Sochi",
    nights: 4,
    brief: "spa",
    pitch: smokePitch("11", 11, { hotel: "Marins", rating: 3.9, beachM: 2100, persona: "premium", expected: "Quiet and spa two steps away" }),
    selected: "pitch_gen_b",
    failure: null,
    iterations: 2,
    loopCostUnits: 990,
    loopTenths: 39,
    finalScore: 0.9,
    delta: 0.06,
  },
]

const loadStep = (row: SmokeRow, callOf: CallOf): StepBuild => ({
  costUnits: 0,
  tenths: LOAD_TENTHS,
  calls: 1,
  stage: {
    ...stageIdentity(LOAD_STAGE),
    kind: "seq",
    description: { kind: "toolCalls", count: 1 },
    costUsd: 0,
    durationS: toSeconds(LOAD_TENTHS),
    groups: [
      {
        id: "data_load",
        kind: "seq",
        rows: rows("call", "agent", "input", "prompt", "output"),
        columns: [
          {
            id: columnId("load_hotels"),
            callId: callOf("load_hotels"),
            nodeId: pitchNode("load_hotels").id,
            name: "load_hotels",
            kind: pitchNode("load_hotels").kind,
            status: "ok",
            subtitle: "hotels.search · read",
            agent: { title: { kind: "deterministic" }, costUsd: 0, durationS: toSeconds(LOAD_TENTHS) },
            input: {
              kind: "refs",
              refs: [
                { provenance: "static", label: `city:"${row.city}"` },
                { provenance: "static", label: `nights:${String(row.nights)}` },
                { provenance: "human", label: `“${row.brief}”` },
              ],
            },
            output: {
              kind: "lines",
              lines: lines("Hotel[] · 10 items", `[0] “${row.pitch.facts.hotel}” · ${String(row.pitch.facts.rating)} · ${beachDistance(row.pitch.facts.beachM)} to beach`),
            },
          },
        ],
      },
    ],
  },
})

const smokeRecord = (row: SmokeRow): RowRecord => {
  const callOf = callsOf(`whole_workflow/${row.id}`)
  const verdict = verdictOf(row.failure)
  const load = loadStep(row, callOf)
  const diverge = divergeStep(divergePlanOf(row.pitch, row, callOf, false))
  const loop = loopStep({
    callOf,
    iterations: row.iterations,
    iterationCalls: panelCalls(row.iterations),
    costUnits: row.loopCostUnits,
    tenths: row.loopTenths,
    finalScore: row.finalScore,
    expectedDelta: row.delta,
    firstInput: { provenance: "generated", label: "draft·v1", value: row.selected },
  })
  const builds = [load, diverge, loop]
  const costUnits = sumBuilds(builds, (build) => build.costUnits)
  const calls = sumBuilds(builds, (build) => build.calls)
  return {
    row: {
      id: rowId(row.id),
      ordinal: row.ordinal,
      values: { city: row.city, nights: row.nights, persona: row.pitch.facts.persona, brief: row.brief, "expected.title": row.pitch.facts.expected },
      assertionCount: row.pitch.assertions.length,
      verdict,
      context: [row.city, `${String(row.nights)} nights`, row.pitch.facts.persona],
    },
    result: resultOf(row.id, verdict, row.selected, {
      iterations: row.iterations,
      calls,
      costUsd: toUsd(costUnits),
      durationS: toSeconds(sumBuilds(builds, (build) => build.tenths)),
      delta: row.delta,
    }),
    trace: {
      rowId: rowId(row.id),
      steps: builds.map((build) => build.stage),
      outcome: outcomeOf(row.failure, failedSpecOf(row.failure, row.pitch.facts), outcomeBranch(row), costUnits, calls),
    },
  }
}

const WHOLE_WORKFLOW: TestFixture = {
  detail: {
    id: testId("whole_workflow"),
    target: { nodeId: nodeId("load_hotels"), kind: "tool" },
    stage: { index: LOAD_STAGE.number, name: "data load", stageId: LOAD_STAGE.id },
    frozenAncestorCount: 0,
    promptSource: { draftRevision: CURRENT_REVISION, cassette: false },
    summary: summaryOf(12, 11, 1.7416, 98, 1),
    dataset: { id: datasetId("smoke_12"), rowCount: 12, assertionCount: 3, source: { kind: "manual" }, columns: SMOKE_COLUMNS },
    runHistory: history([10, 12, 1.83], [11, 12, 1.74], "max_tokens 8192 removed the truncated pitch"),
  },
  records: SMOKE_ROWS.map(smokeRecord),
}

const FIXTURES: readonly TestFixture[] = [PITCH_GEN_B, DIVERGE_STAGE_4, CRITIC_LOOP_STAGE_5, SCORE_HOTEL, WHOLE_WORKFLOW]

const detailOf = ({ detail, records }: TestFixture): TestDetail => ({
  ...detail,
  dataset: { ...detail.dataset, rows: records.map((record) => record.row) },
  results: records.map((record) => record.result),
})

export const testDetails: Readonly<Record<string, TestDetail>> = Object.fromEntries(
  FIXTURES.map((fixture) => [workflowKey(WORKFLOWS.pitchPipeline, fixture.detail.id), detailOf(fixture)]),
)

export const rowTraces: Readonly<Record<string, RowTrace>> = Object.fromEntries(
  FIXTURES.flatMap((fixture) =>
    fixture.records.map((record) => [workflowKey(WORKFLOWS.pitchPipeline, fixture.detail.id, record.row.id), record.trace]),
  ),
)
