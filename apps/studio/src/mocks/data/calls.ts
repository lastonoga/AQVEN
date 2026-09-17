import type {
  AgentCell,
  AttemptLadder,
  CallChecks,
  CallColumn,
  CallDetail,
  CallInput,
  CallOutput,
  CallPrompt,
  CallStatus,
  CheckCell,
  CheckResult,
  ContentPart,
  DataflowRun,
  DatasetId,
  FreezeEntry,
  InputCell,
  JudgeVote,
  MatrixGroup,
  ModelFamily,
  ModelInfo,
  NodeKind,
  OutputCell,
  ParsedField,
  Provenance,
  Ratio,
  RoutingInfo,
  RowId,
  RowTrace,
  RunId,
  RunSummary,
  ScoreFact,
  StageRun,
  TestDetail,
  TextLine,
  TextMark,
  TextRun,
} from "@/domain"
import { callId, datasetId, nodeId, revisionId, rowId, runId } from "@/data/ids"
import { findCatalogNode, type CatalogNode } from "./catalog"
import { dataflowRuns } from "./dataflow"
import { WORKFLOWS, resourceKey, workflowKey } from "./keys"
import { runLists } from "./run-list"
import { rowTraces, testDetails } from "./test-detail"

const WAVEFORM_SCALE_PX = 40
const SCOPE_SEGMENTS = 2
const KEY_SEPARATOR = "/"
const ORDER_ARROW = " → "
const LINE_BREAK = "\n"
const PASS_SCORE = 0.7
const JUDGE_QUORUM = 2
const MAX_PARSED_FIELDS = 3
const DEFAULT_TIMEOUT_S = 60
const JSON_INDENT = 2
const TOKEN_COST_SHARE = { input: 0.4, output: 0.6 } as const
const TOKENS_PER_PRICE_UNIT = 1000
const PRICE_PRECISION = 1_000_000
const PREVIOUS_REVISION = revisionId("r41")
const CURRENT_REVISION = revisionId("r42")
const FALLBACK_RUN = runId("local")
const FALLBACK_ROW = rowId("01")
const MAIN_BRANCH = "main"
const SLOT_SIGIL = "$"
const BRANCH_SUFFIX = /_([a-z])$/
const TEMPLATE_ID = /[a-z][a-z0-9_]*[_ ]v\d+/
const CHIP = /^(\S)\s+(.+?)(?:\s+←\s+(.+))?$/u
const ASSIGNMENT = /^\$([a-z_][\w.]*)(?:\s*=\s*|\s+)(.+)$/i
const LABEL_PATH = /^([a-z_][\w.]*(?:\[[^\]]*\])?)[\s·:=]*(.*)$/i
const NODE_REF = /^[a-z][a-z0-9_]*(?:\[[^\]]*\])?$/
const PATH_INDEX = /\[[^\]]*\]$/
const PATH_BREAK = /[._]+/g
const FACTS_REMARK = /^facts:/
const FACTS_ASSERTION = "every number exists in facts"
const LIVE_CASSETTE = "none · live call"
const CACHED_CASSETTE = "hit · replayed from an earlier run"
const NONE = "—"
const META_SEPARATOR = " · "
const CHARS_PER_TOKEN = 4
const SCORE_DIGITS = 2

const joinMeta = (parts: readonly (string | undefined)[]): string =>
  parts.filter((part): part is string => part !== undefined && part.length > 0).join(META_SEPARATOR)

const score = (value: number): string => value.toFixed(SCORE_DIGITS)

const seconds = (value: number, digits: number): string => `${value.toFixed(digits)} s`

const tokensOfText = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN)

const amplitudes = (heightsPx: readonly number[]): readonly number[] => heightsPx.map((height) => height / WAVEFORM_SCALE_PX)

const CALL_01HT9: CallDetail = {
  id: callId("call_01HT9"),
  runId: runId("8247"),
  nodeId: nodeId("pitch_gen_b"),
  kind: "llm",
  branch: "b",
  stage: 4,
  row: rowId("07"),
  attempt: 4,
  attempts: 4,
  totalCostUsd: 0.0611,
  model: {
    provider: "Anthropic (direct)",
    model: "claude-sonnet-4.5",
    snapshot: "2025-09-29",
    api: "messages v1 · stream",
    region: "us-east-1",
    quantization: "managed · not configurable",
    context: "200k",
    billing: "by provider tokens",
  },
  routing: {
    profile: "pitch_fast",
    order: ["sonnet-4.5", "sonnet-4.5-mini"],
    fallbackReason: "429 · rate limit",
    retries: "3 · exp. backoff 0.5→4 s",
    timeoutS: 60,
    cassette: "none · live call",
  },
  params: {
    temperature: 0.9,
    top_p: 1,
    max_tokens: { value: 8192, changedIn: revisionId("r42"), previous: 4096 },
    seed: 1337,
    stop: [],
    response_format: "json_schema · strict",
  },
  billing: {
    inputTokens: 1998,
    outputTokens: 604,
    pricePer1k: { inputUsd: 0.003, outputUsd: 0.015 },
    attemptCostUsd: 0.0126,
    failedAttemptsCostUsd: 0.01,
    callTotalUsd: 0.0611,
  },
  input: {
    parts: [
      { kind: "text", name: "pitch.title", meta: "21 chars · 7 tok", text: "“A work trip with the family”" },
      { kind: "image", name: "hotel_photos[0]", meta: "8 images · 22.4 MB", width: 4032, height: 3024, caption: "4032×3024 · jpeg" },
      {
        kind: "audio",
        name: "brand_voice_ref.wav",
        meta: "0:12 · 48 kHz",
        waveform: amplitudes([30, 23, 29, 40, 32, 29, 37, 38, 18, 40, 21, 21, 40, 17, 25, 17, 18, 32, 38, 35, 34, 18, 31, 28, 21, 37, 18, 35, 20, 17, 33, 34, 37, 36]),
      },
      { kind: "document", name: "brand_guide.pdf", meta: "2.4 MB", caption: "12 pages · pages 3–5 attached · 1 842 tok" },
      { kind: "text", name: "facts", meta: "json · 7 fields", text: "beach_m 2100 · pool true · kids_club false" },
    ],
    slots: [
      { provenance: "generated", label: "ranked.items[0..2]", value: "$rank_hotels.out" },
      { provenance: "data", label: "facts", value: "$load_hotels.out" },
      { provenance: "knowledge", label: "tone.chunks", value: "brand_voice v4 · 4 chunks" },
      { provenance: "static", label: "persona", value: "“family” · row #07" },
      { provenance: "human", label: "brief_extra", value: "@lead · “no superlatives”" },
      { provenance: "static", label: "format", value: "from the Pitch type" },
    ],
    rowValues: [
      "hotel: Bella Vista Resort · rating 3.9",
      "facts.beach_distance_m: 2100",
      "facts.pool: true · facts.kids_club: false",
      "persona: «family»",
      "input hash: a71e4c92",
    ],
    freeze: [
      { kind: "recorded", node: nodeId("load_hotels"), fromRun: runId("8247") },
      { kind: "recorded", node: nodeId("rank_hotels"), fromRun: runId("8247") },
      { kind: "knowledge", value: "brand_voice v4 · draft r42" },
    ],
  },
  prompt: {
    template: {
      id: "pitch_v7",
      revision: revisionId("r42"),
      text: [
        "You are writing a hotel pitch for the audience $persona.",
        "",
        "Tone and bans:",
        "$tone.chunks",
        "",
        "Candidates:",
        "$ranked.items[0..2]",
        "",
        "Facts:",
        "$facts",
        "",
        "From the client: $brief_extra",
      ].join(LINE_BREAK),
    },
    system:
      "You are a copywriter for a hotel marketplace. Reply strictly as JSON per the Pitch schema. Do not invent facts: any number must come from the “Facts” block.",
    user: {
      tokens: 1998,
      text: [
        "You are writing a hotel pitch for the “family” audience.",
        "",
        "Tone and bans:",
        "— no superlatives (“perfect”, “best”)",
        "— promise nothing absent from the facts",
        "— 2–3 short paragraphs",
        "",
        "Candidates:",
        "1. Bella Vista Resort · 3.9 · 2,100 m to beach",
        "2. Marina Bay Suites · 4.4 · 90 m",
        "3. Pine Ridge Lodge · 4.1 · 1,800 m",
        "",
        "Facts:",
        "beach_distance_m: 2100 · pool: true · kids_club: false",
        "",
        "From the client: no superlatives, mention the pool",
      ].join(LINE_BREAK),
    },
    diff: [
      { op: "add", text: "superlatives banned (brand_voice v4)" },
      { op: "remove", text: "“make the copy vivid and unforgettable”" },
    ],
  },
  output: {
    parts: [
      { kind: "image", name: "hero.png", meta: "1.8 MB · 2 rejected", width: 1536, height: 1024, caption: "1536×1024 · png · seed 1337" },
      {
        kind: "audio",
        name: "voiceover.mp3",
        meta: "0:41 · 128 kbps",
        waveform: amplitudes([38, 35, 21, 27, 37, 28, 22, 37, 24, 31, 23, 25, 19, 39, 18, 16, 21, 16, 34, 28, 24, 17, 27, 20, 36, 16, 30, 23, 29, 18, 27, 20, 33, 17]),
      },
      {
        kind: "video",
        name: "teaser_15s.mp4",
        meta: "8.4 MB · h264",
        width: 1080,
        height: 1920,
        frameTimesS: [0, 4, 8, 12],
        playhead: 0.34,
        caption: "0:15 · 1080×1920 · 24 fps",
      },
      { kind: "text", name: "alt_text", meta: "46 chars", text: "“Pool terrace at dusk, family table set for six”" },
    ],
    raw: {
      tokens: 604,
      text: [
        "{",
        '  "title": "Park, spa and quiet",',
        '  "body": "Bella Vista Resort sits in a 12 ha park…",',
        '  "hooks": ["12 ha park", "1,200 m² spa", ""]',
        "}",
      ].join(LINE_BREAK),
    },
    parsed: {
      type: "Pitch",
      fields: [
        { path: "title", result: { kind: "ok", length: 21, max: 90 } },
        { path: "body", result: { kind: "ok", length: 412 } },
        { path: "hooks[0]", result: { kind: "value", value: "“12 ha park”" } },
        { path: "hooks[1]", result: { kind: "value", value: "“1,200 m² spa”" } },
        { path: "hooks[2]", result: { kind: "empty" } },
      ],
    },
    validationErrors: ["FAIL hooks[2]: minLength 1 — got an empty string"],
    comparison: { actual: "“Park, spa and quiet”", expected: "“A holiday next to the park”", semantic: 0.71, factual: 1 },
  },
  checks: {
    assertions: [
      { name: "hooks[*] non-empty", pass: false },
      { name: "no banned words", pass: true },
      { name: "every number exists in facts", pass: true },
    ],
    judges: {
      quorum: 2,
      votes: [
        { node: nodeId("judge_style"), model: "opus-4.1", score: 0.83 },
        { node: nodeId("judge_facts"), model: "gpt-5.1-mini", score: 0.88 },
        { node: nodeId("judge_tone"), model: "gemini-3-flash", score: 0.8 },
      ],
      decision: { verdict: "approved", passed: 2, total: 3 },
    },
    history: {
      entries: [
        { revision: revisionId("r41"), draft: false, verdict: "fail", note: "truncated at 4096" },
        { revision: revisionId("r42"), draft: true, verdict: "fail", note: "empty third hook" },
      ],
      dataset: datasetId("pitch_golden_v4"),
    },
  },
}

type Engine = "model" | "deterministic"

type FamilyProfile = {
  readonly info: Omit<ModelInfo, "model">
  readonly models: readonly [string, ...string[]]
  readonly pricePer1k: { readonly inputUsd: number; readonly outputUsd: number }
}

export type CallDetailSources = {
  readonly dataflowRuns: Readonly<Record<string, DataflowRun>>
  readonly rowTraces: Readonly<Record<string, RowTrace>>
  readonly runLists: Readonly<Record<string, readonly RunSummary[]>>
  readonly testDetails: Readonly<Record<string, TestDetail>>
}

type ScopeBase = {
  readonly scope: string
  readonly runId: RunId
  readonly row: RowId
  readonly dataset: DatasetId
}

type SiteBase = ScopeBase & {
  readonly stage: number
  readonly ladder: AttemptLadder | undefined
  readonly branch: string
  readonly kind: NodeKind
}

type CallSite = SiteBase & {
  readonly column: CallColumn
  readonly group: MatrixGroup
}

type Tokens = { readonly input: number; readonly output: number }

type ScoreThreshold = { readonly value: number; readonly threshold: number }

type FailureNote = (column: CallColumn) => string | undefined

type OutputIndex = ReadonlyMap<string, readonly string[]>

type SlotDraft = { readonly provenance: Provenance; readonly label: string; readonly source: string | undefined }

type SlotContext = {
  readonly templateId: string
  readonly note: string | undefined
  readonly parts: readonly ContentPart[]
  readonly outputs: OutputIndex
}

type SlotFacts = { readonly draft: SlotDraft; readonly path: string; readonly rest: string; readonly context: SlotContext }

type SlotReading = { readonly value: string; readonly compiled: readonly string[] }

type SlotReader = (facts: SlotFacts) => SlotReading | undefined

type Slot = SlotReading & { readonly provenance: Provenance; readonly path: string; readonly node: string | undefined }

type CallContext = {
  readonly site: CallSite
  readonly tokens: Tokens
  readonly templateId: string
  readonly slots: readonly Slot[]
}

const NO_TOKENS: Tokens = { input: 0, output: 0 }

const FAMILY_PROFILE: Readonly<Record<ModelFamily, FamilyProfile>> = {
  anthropic: {
    info: {
      provider: "Anthropic (direct)",
      snapshot: "2025-09-29",
      api: "messages v1 · stream",
      region: "us-east-1",
      quantization: "managed · not configurable",
      context: "200k",
      billing: "by provider tokens",
    },
    models: ["sonnet-4.5", "haiku-4.5", "opus-4.1"],
    pricePer1k: { inputUsd: 0.003, outputUsd: 0.015 },
  },
  openai: {
    info: {
      provider: "OpenAI (direct)",
      snapshot: "2025-11-13",
      api: "responses v1 · stream",
      region: "us-east-2",
      quantization: "managed · not configurable",
      context: "400k",
      billing: "by provider tokens",
    },
    models: ["gpt-5.1", "gpt-5.1-mini"],
    pricePer1k: { inputUsd: 0.00125, outputUsd: 0.01 },
  },
  google: {
    info: {
      provider: "Google (Vertex AI)",
      snapshot: "2025-11-18",
      api: "generateContent v1 · stream",
      region: "europe-west4",
      quantization: "managed · not configurable",
      context: "1M",
      billing: "by provider tokens",
    },
    models: ["gemini-3-pro", "gemini-3-flash"],
    pricePer1k: { inputUsd: 0.002, outputUsd: 0.012 },
  },
  mistral: {
    info: {
      provider: "Mistral (La Plateforme)",
      snapshot: "2025-12-02",
      api: "chat completions v1 · stream",
      region: "eu-west-1",
      quantization: "managed · not configurable",
      context: "128k",
      billing: "by provider tokens",
    },
    models: ["large-3", "medium-3"],
    pricePer1k: { inputUsd: 0.0005, outputUsd: 0.0015 },
  },
}

const DETERMINISTIC_MODEL: ModelInfo = {
  provider: "none · not a model call",
  model: NONE,
  snapshot: NONE,
  api: "in-process function",
  region: "workflow runner",
  quantization: NONE,
  context: NONE,
  billing: "not billed",
}

const ENGINE: Readonly<Record<NodeKind, Engine>> = {
  llm: "model",
  image: "model",
  audio: "model",
  video: "model",
  tool: "deterministic",
  fn: "deterministic",
  human: "deterministic",
}

const OUTCOME_NOTE: Readonly<Record<CallStatus, string>> = {
  ok: "all assertions hold",
  degraded: "passed on the fallback model",
  failed: "empty required field",
  cached: "replayed from cassette",
  idle: "not reached in this run",
  waiting: "waiting for an upstream call",
  skipped: "skipped by the switch",
  aborted: "aborted by stagnation",
}

const FALLBACK_REASON: Readonly<Record<CallStatus, string>> = {
  ok: "not triggered",
  degraded: "429 · rate limit",
  failed: "schema failed twice",
  cached: "not triggered",
  idle: "not triggered",
  waiting: "not triggered",
  skipped: "not triggered",
  aborted: "not triggered",
}

const DEFAULT_ASSERTIONS: readonly { readonly name: string; readonly failsOn: CallStatus }[] = [
  { name: "no empty required fields", failsOn: "failed" },
  { name: "output matches the declared type", failsOn: "failed" },
  { name: "finished without an early stop", failsOn: "aborted" },
]

const JUDGE_PANEL: readonly Omit<JudgeVote, "score">[] = [
  { node: nodeId("judge_style"), model: "opus-4.1" },
  { node: nodeId("judge_facts"), model: "gpt-5.1-mini" },
  { node: nodeId("judge_tone"), model: "gemini-3-flash" },
]

const DEFAULT_PATH: Readonly<Record<Provenance, string>> = {
  static: "param",
  data: "record",
  knowledge: "chunks",
  generated: "draft",
  human: "brief_extra",
}

const CHIP_PROVENANCE: ReadonlyMap<string, Provenance> = new Map([
  ["▪", "static"],
  ["▤", "data"],
  ["▦", "knowledge"],
  ["✦", "generated"],
  ["◌", "human"],
])

const MARK_PROVENANCE: ReadonlyMap<TextMark, Provenance> = new Map([
  ["static", "static"],
  ["data", "data"],
  ["knowledge", "knowledge"],
  ["generated", "generated"],
  ["human", "human"],
  ["text", "generated"],
  ["json", "generated"],
  ["image", "generated"],
  ["audio", "generated"],
  ["document", "generated"],
  ["video", "generated"],
])

const RECORDED_PROVENANCE: ReadonlySet<Provenance> = new Set(["data", "generated"])

const EMPTY_PROMPT: CallPrompt = {
  template: { id: NONE, revision: CURRENT_REVISION, text: "" },
  system: "",
  user: { text: "", tokens: 0 },
  diff: [],
}

const lineText = (line: TextLine): string => line.map((run) => (typeof run === "string" ? run : run.text)).join("")

const linesText = (lines: readonly TextLine[]): string => lines.map(lineText).join(LINE_BREAK)

const scopeOf = (key: string): string => key.split(KEY_SEPARATOR).slice(0, SCOPE_SEGMENTS).join(KEY_SEPARATOR)

const workflowOf = (scope: string): string => scope.split(KEY_SEPARATOR).at(-1) ?? scope

const branchOf = (name: string, inherited: string): string => BRANCH_SUFFIX.exec(name)?.[1] ?? inherited

const statusOf = (column: CallColumn): CallStatus => column.status ?? "ok"

const engineOf = (site: CallSite): Engine => ENGINE[site.kind]

const nodeIdOf = (column: CallColumn): string => column.nodeId ?? column.id

const catalogNodeOf = (site: Pick<CallSite, "scope" | "column">): CatalogNode | undefined =>
  findCatalogNode(workflowOf(site.scope), nodeIdOf(site.column))

const titleFamily = (column: CallColumn): ModelFamily | undefined => {
  const title = column.agent?.title
  return title?.kind === "model" ? title.family : column.family
}

const titleModel = (column: CallColumn): string | undefined => {
  const title = column.agent?.title
  return title?.kind === "model" ? title.model.split(ORDER_ARROW)[0] : undefined
}

const familyOf = (site: CallSite): ModelFamily => catalogNodeOf(site)?.model?.family ?? titleFamily(site.column) ?? "anthropic"

const primaryModelOf = (site: CallSite, profile: FamilyProfile): string =>
  catalogNodeOf(site)?.model?.model ?? titleModel(site.column) ?? profile.models[0]

const fallbackModelOf = (primary: string, profile: FamilyProfile): string =>
  profile.models.find((model) => model !== primary) ?? primary

const ladderOf = (site: CallSite): AttemptLadder | undefined =>
  site.ladder?.columnId === site.column.id ? site.ladder : undefined

const costOf = (agent: AgentCell | undefined): number => agent?.costUsd ?? 0

const derivedTokens = (costUsd: number, profile: FamilyProfile): Tokens => ({
  input: Math.round((costUsd * TOKEN_COST_SHARE.input * TOKENS_PER_PRICE_UNIT) / profile.pricePer1k.inputUsd),
  output: Math.round((costUsd * TOKEN_COST_SHARE.output * TOKENS_PER_PRICE_UNIT) / profile.pricePer1k.outputUsd),
})

const agentTokensOf = (agent: AgentCell | undefined, profile: FamilyProfile): Tokens => {
  const tokens = agent?.tokens
  if (tokens === "cassette") return NO_TOKENS
  return tokens ?? derivedTokens(costOf(agent), profile)
}

const attemptTokensOf = (site: CallSite, profile: FamilyProfile): Tokens => {
  if (engineOf(site) === "deterministic") return NO_TOKENS
  return ladderOf(site)?.attempts.at(-1)?.tokens ?? agentTokensOf(site.column.agent, profile)
}

const perThousand = (costUsd: number, tokens: number): number => {
  if (tokens === 0) return 0
  return Math.round((costUsd * TOKENS_PER_PRICE_UNIT * PRICE_PRECISION) / tokens) / PRICE_PRECISION
}

const priceOf = (costUsd: number, tokens: Tokens): CallDetail["billing"]["pricePer1k"] => ({
  inputUsd: perThousand(costUsd * TOKEN_COST_SHARE.input, tokens.input),
  outputUsd: perThousand(costUsd * TOKEN_COST_SHARE.output, tokens.output),
})

const cassetteOf = (site: CallSite): string => {
  const durationS = site.column.agent?.durationS
  if (statusOf(site.column) === "cached") return CACHED_CASSETTE
  if (durationS === undefined) return LIVE_CASSETTE
  return joinMeta([LIVE_CASSETTE, seconds(durationS, 2)])
}

const modelInfoOf = (site: CallSite): ModelInfo => {
  if (engineOf(site) === "deterministic") return DETERMINISTIC_MODEL
  const profile = FAMILY_PROFILE[familyOf(site)]
  return { ...profile.info, model: primaryModelOf(site, profile) }
}

const routingOf = (site: CallSite): RoutingInfo => {
  const attempts = ladderOf(site)?.attempts.length ?? 1
  if (engineOf(site) === "deterministic") {
    return { profile: NONE, order: [], fallbackReason: NONE, retries: "0", timeoutS: DEFAULT_TIMEOUT_S, cassette: cassetteOf(site) }
  }
  const profile = FAMILY_PROFILE[familyOf(site)]
  const primary = primaryModelOf(site, profile)
  return {
    profile: catalogNodeOf(site)?.model?.profile ?? `${site.group.id}_default`,
    order: [primary, fallbackModelOf(primary, profile)],
    fallbackReason: FALLBACK_REASON[statusOf(site.column)],
    retries: `${String(attempts - 1)} · exp. backoff 0.5→4 s`,
    timeoutS: DEFAULT_TIMEOUT_S,
    cassette: cassetteOf(site),
  }
}

const billingOf = ({ site, tokens }: CallContext): CallDetail["billing"] => {
  const ladder = ladderOf(site)
  const cost = costOf(site.column.agent)
  const attemptCostUsd = ladder?.attempts.at(-1)?.costUsd ?? cost
  return {
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    pricePer1k: priceOf(attemptCostUsd, tokens),
    attemptCostUsd,
    failedAttemptsCostUsd: ladder?.failedUsd ?? 0,
    callTotalUsd: ladder?.billedUsd ?? cost,
  }
}

const inputOf = (site: CallSite): InputCell | undefined => site.column.input ?? site.group.shared?.input

const partsOf = (cell: InputCell | OutputCell | undefined): readonly ContentPart[] => (cell?.kind === "parts" ? cell.parts : [])

const noteOf = (input: InputCell | undefined): string | undefined => (input?.kind === "refs" ? input.note : undefined)

const promptLinesOf = (site: CallSite): readonly TextLine[] => site.column.prompt ?? site.group.shared?.prompt ?? []

const chipDraftsOf = (line: string): readonly SlotDraft[] => {
  const match = CHIP.exec(line)
  const provenance = CHIP_PROVENANCE.get(match?.[1] ?? "")
  if (match === null || provenance === undefined) return []
  return [{ provenance, label: match[2] ?? line, source: match[3] }]
}

const isChip = (line: string): boolean => chipDraftsOf(line).length > 0

const assignmentDraftsOf = (line: string): readonly SlotDraft[] => {
  const match = ASSIGNMENT.exec(line)
  if (match === null) return []
  return [{ provenance: "static", label: match[1] ?? line, source: match[2] }]
}

const markDraftsOf = (run: TextRun): readonly SlotDraft[] => {
  if (typeof run === "string" || !run.text.startsWith(SLOT_SIGIL)) return []
  const provenance = MARK_PROVENANCE.get(run.mark)
  if (provenance === undefined) return []
  return [{ provenance, label: run.text.slice(SLOT_SIGIL.length), source: undefined }]
}

const inputDraftsOf = (input: InputCell | undefined): readonly SlotDraft[] => {
  if (input?.kind === "refs") return input.refs.map((ref) => ({ provenance: ref.provenance, label: ref.label, source: ref.value }))
  if (input?.kind === "text") return input.lines.map(lineText).flatMap(chipDraftsOf)
  return []
}

const rowValuesOf = (input: InputCell | undefined): readonly string[] => {
  if (input?.kind === "text") return input.lines.map(lineText).filter((line) => !isChip(line))
  if (input?.kind !== "refs") return []
  return [input.note, input.hash === undefined ? undefined : `input hash: ${input.hash}`].filter((value) => value !== undefined)
}

const recordedNodeOf = (draft: SlotDraft): string | undefined => {
  if (!RECORDED_PROVENANCE.has(draft.provenance) || draft.source === undefined) return undefined
  return NODE_REF.test(draft.source) ? draft.source : undefined
}

const matchingPart = (path: string, parts: readonly ContentPart[]): ContentPart | undefined =>
  parts.find((part) => part.name.startsWith(path))

const partText = (part: ContentPart): string => ("text" in part ? part.text : joinMeta([part.name, part.meta]))

const recordedReading: SlotReader = ({ draft, context }) => {
  const node = recordedNodeOf(draft)
  if (node === undefined) return undefined
  const value = `${SLOT_SIGIL}${node}.out`
  return { value, compiled: context.outputs.get(node) ?? [value] }
}

const sourceReading: SlotReader = ({ draft }) => (draft.source === undefined ? undefined : { value: draft.source, compiled: [draft.source] })

const detailReading: SlotReader = ({ rest, context }) => (rest.length === 0 ? undefined : { value: rest, compiled: [context.note ?? rest] })

const partReading: SlotReader = ({ path, context }) => {
  const part = matchingPart(path, context.parts)
  if (part === undefined) return undefined
  return { value: joinMeta([part.name, part.meta]), compiled: [partText(part)] }
}

const templateReading = ({ context }: SlotFacts): SlotReading => {
  const value = `from the ${context.templateId} template`
  return { value, compiled: [value] }
}

const SLOT_READERS: readonly SlotReader[] = [recordedReading, sourceReading, detailReading, partReading]

const readingOf = (facts: SlotFacts): SlotReading =>
  SLOT_READERS.reduce<SlotReading | undefined>((found, read) => found ?? read(facts), undefined) ?? templateReading(facts)

const slotOf = (draft: SlotDraft, context: SlotContext): Slot => {
  const match = LABEL_PATH.exec(draft.label)
  const path = match?.[1] ?? DEFAULT_PATH[draft.provenance]
  const rest = match === null ? draft.label : (match[2] ?? "")
  return { provenance: draft.provenance, path, node: recordedNodeOf(draft), ...readingOf({ draft, path, rest, context }) }
}

const firstByPath = (slots: readonly Slot[]): readonly Slot[] =>
  slots.filter((slot, index) => slots.findIndex((other) => other.path === slot.path) === index)

const slotsOf = (site: CallSite, context: SlotContext): readonly Slot[] => {
  const prompt = promptLinesOf(site)
  const drafts = [...prompt.map(lineText).flatMap(assignmentDraftsOf), ...inputDraftsOf(inputOf(site)), ...prompt.flat().flatMap(markDraftsOf)]
  return firstByPath(drafts.map((draft) => slotOf(draft, context)))
}

const freezeEntryOf = (slot: Slot, fromRun: RunId): readonly FreezeEntry[] => {
  if (slot.node !== undefined) return [{ kind: "recorded", node: nodeId(slot.node), fromRun }]
  if (slot.provenance !== "knowledge") return []
  return [{ kind: "knowledge", value: joinMeta([slot.value, `draft ${CURRENT_REVISION}`]) }]
}

const callInputOf = ({ site, slots }: CallContext): CallInput => {
  const input = inputOf(site)
  return {
    parts: partsOf(input),
    slots: slots.map(({ provenance, path, value }) => ({ provenance, label: path, value })),
    rowValues: rowValuesOf(input),
    freeze: slots.flatMap((slot) => freezeEntryOf(slot, site.runId)),
  }
}

const templateIdOf = (site: CallSite): string => TEMPLATE_ID.exec(linesText(promptLinesOf(site)))?.[0] ?? `${site.column.id}_v1`

const headingOf = (path: string): string => {
  const words = path.replace(PATH_INDEX, "").replace(PATH_BREAK, " ")
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}:`
}

const slotBlock = (path: string, body: readonly string[], index: number): readonly string[] => [
  ...(index === 0 ? [] : [""]),
  headingOf(path),
  ...body,
]

const templateTextOf = (slots: readonly Slot[]): string =>
  slots.flatMap((slot, index) => slotBlock(slot.path, [`${SLOT_SIGIL}${slot.path}`], index)).join(LINE_BREAK)

const compiledTextOf = ({ site, slots }: CallContext): string => {
  if (slots.length === 0) return rowValuesOf(inputOf(site)).join(LINE_BREAK)
  return slots.flatMap((slot, index) => slotBlock(slot.path, slot.compiled, index)).join(LINE_BREAK)
}

const agentNameOf = (column: CallColumn): string => column.agent?.config?.agent ?? column.id

const modelPromptOf = (context: CallContext): CallPrompt => {
  const text = compiledTextOf(context)
  return {
    template: { id: context.templateId, revision: CURRENT_REVISION, text: templateTextOf(context.slots) },
    system: `You are the ${agentNameOf(context.site.column)} agent of the ${workflowOf(context.site.scope)} workflow. Reply strictly as JSON per the declared output type. Do not invent facts.`,
    user: { text, tokens: tokensOfText(text) },
    diff: context.templateId === CALL_01HT9.prompt.template.id ? CALL_01HT9.prompt.diff : [],
  }
}

const CALL_PROMPT: Readonly<Record<Engine, (context: CallContext) => CallPrompt>> = {
  model: modelPromptOf,
  deterministic: () => EMPTY_PROMPT,
}

const OUTPUT_TEXT: { readonly [K in OutputCell["kind"]]: (cell: OutputCell & { readonly kind: K }) => readonly string[] } = {
  lines: (cell) => cell.lines.map(lineText),
  parts: (cell) => cell.parts.map((part) => joinMeta([part.name, part.meta])),
  verdict: (cell) => [cell.verdict, ...(cell.remark === undefined ? [] : [cell.remark])],
  status: (cell) => [cell.status],
}

const outputTextOf = <K extends OutputCell["kind"]>(kind: K, cell: OutputCell & { readonly kind: K }): readonly string[] => {
  const view: (cell: OutputCell & { readonly kind: K }) => readonly string[] = OUTPUT_TEXT[kind]
  return view(cell)
}

const outputLinesOf = (cell: OutputCell | undefined): readonly string[] => (cell === undefined ? [] : outputTextOf(cell.kind, cell))

const parsedFieldsOf = (lines: readonly string[], status: CallStatus): readonly ParsedField[] => {
  const values: readonly ParsedField[] = lines
    .slice(0, MAX_PARSED_FIELDS)
    .map((value, index) => ({ path: `result[${String(index)}]`, result: { kind: "value", value } }))
  if (status !== "failed") return values
  return [...values, { path: `result[${String(values.length)}]`, result: { kind: "empty" } }]
}

const rawTextOf = (lines: readonly string[]): string => {
  if (lines.length === 0) return ""
  return JSON.stringify({ result: lines }, null, JSON_INDENT)
}

const outputTypeOf = (site: CallSite): string =>
  site.group.rows.find((spec) => spec.key === "output")?.detail ?? `${site.column.id}.out`

const remarkAssertions = (check: CheckCell | undefined): readonly CheckResult[] => {
  const note = check?.note
  if (note?.pass !== false || !FACTS_REMARK.test(note.text)) return []
  return [{ name: FACTS_ASSERTION, pass: false }]
}

const thresholdOf = (fact: ScoreFact | undefined): ScoreThreshold | undefined => {
  if (fact?.threshold === undefined) return undefined
  return { value: fact.value, threshold: fact.threshold }
}

const thresholdAssertions = (check: CheckCell | undefined): readonly CheckResult[] => {
  const scored = thresholdOf(check?.score)
  if (scored === undefined) return []
  return [{ name: `score reaches the ${score(scored.threshold)} threshold`, pass: scored.value >= scored.threshold }]
}

const factsHold = (column: CallColumn): boolean => statusOf(column) !== "failed" && remarkAssertions(column.check).length === 0

const callOutputOf = ({ site, tokens }: CallContext): CallOutput => {
  const status = statusOf(site.column)
  const lines = outputLinesOf(site.column.output)
  const comparison = site.column.check?.comparison
  const semantic = site.column.check?.score?.value ?? 1
  return {
    parts: partsOf(site.column.output),
    raw: { tokens: tokens.output, text: rawTextOf(lines) },
    parsed: { type: outputTypeOf(site), fields: parsedFieldsOf(lines, status) },
    validationErrors: status === "failed" ? [`FAIL result[${String(Math.min(lines.length, MAX_PARSED_FIELDS))}]: minLength 1 — got an empty string`] : [],
    comparison: {
      actual: comparison?.actual ?? lines[0] ?? NONE,
      expected: comparison?.expected ?? NONE,
      semantic,
      factual: factsHold(site.column) ? 1 : semantic,
    },
  }
}

const statusAssertions = (status: CallStatus): readonly CheckResult[] =>
  DEFAULT_ASSERTIONS.map(({ name, failsOn }) => ({ name, pass: status !== failsOn }))

const ratioAssertions = ({ passed, total }: Ratio): readonly CheckResult[] =>
  DEFAULT_ASSERTIONS.slice(0, total).map(({ name }, index) => ({ name, pass: index < passed }))

const baseAssertions = (column: CallColumn): readonly CheckResult[] => {
  const check = column.check
  if (check?.checks !== undefined) return check.checks
  if (check?.ratio !== undefined) return ratioAssertions(check.ratio)
  return statusAssertions(statusOf(column))
}

const assertionsOf = (column: CallColumn): readonly CheckResult[] => [
  ...baseAssertions(column),
  ...remarkAssertions(column.check),
  ...thresholdAssertions(column.check),
]

const remarkNote: FailureNote = ({ check }) => (check?.note?.pass === false ? check.note.text : undefined)

const thresholdNote: FailureNote = ({ check }) => {
  const scored = thresholdOf(check?.score)
  if (scored === undefined || scored.value >= scored.threshold) return undefined
  return `score ${score(scored.value)} below the ${score(scored.threshold)} threshold`
}

const neutralNote: FailureNote = ({ check }) => (check?.note?.pass === undefined ? check?.note?.text : undefined)

const statusNote: FailureNote = (column) => {
  const status = statusOf(column)
  return DEFAULT_ASSERTIONS.some(({ failsOn }) => failsOn === status) ? OUTCOME_NOTE[status] : undefined
}

const FAILURE_NOTES: readonly FailureNote[] = [remarkNote, thresholdNote, neutralNote, statusNote]

const historyNoteOf = (column: CallColumn, assertions: readonly CheckResult[]): string => {
  const failing = assertions.find((check) => !check.pass)
  if (failing === undefined) return OUTCOME_NOTE[statusOf(column)]
  return FAILURE_NOTES.reduce<string | undefined>((found, read) => found ?? read(column), undefined) ?? failing.name
}

const votesOf = (column: CallColumn): readonly JudgeVote[] =>
  (column.check?.score?.judges ?? []).flatMap((value, index) => {
    const judge = JUDGE_PANEL[index]
    return judge === undefined ? [] : [{ ...judge, score: value }]
  })

const datasetOf = (scope: string, details: CallDetailSources["testDetails"]): DatasetId => {
  const detail = Object.entries(details).find(([key]) => key.startsWith(`${scope}${KEY_SEPARATOR}`))?.[1]
  return detail?.dataset.id ?? datasetId(`${workflowOf(scope)}_golden`)
}

const checksOf = ({ site }: CallContext): CallChecks => {
  const assertions = assertionsOf(site.column)
  const votes = votesOf(site.column)
  const passed = votes.filter((vote) => vote.score >= PASS_SCORE).length
  return {
    assertions,
    judges: {
      quorum: votes.length === 0 ? 0 : JUDGE_QUORUM,
      votes,
      decision: { verdict: passed >= JUDGE_QUORUM || votes.length === 0 ? "approved" : "rejected", passed, total: votes.length },
    },
    history: {
      entries: [
        { revision: PREVIOUS_REVISION, draft: false, verdict: "pass", note: "baseline" },
        {
          revision: CURRENT_REVISION,
          draft: true,
          verdict: assertions.every((check) => check.pass) ? "pass" : "fail",
          note: historyNoteOf(site.column, assertions),
        },
      ],
      dataset: site.dataset,
    },
  }
}

const contextOf = (site: CallSite, outputs: OutputIndex): CallContext => {
  const input = inputOf(site)
  const templateId = templateIdOf(site)
  return {
    site,
    tokens: attemptTokensOf(site, FAMILY_PROFILE[familyOf(site)]),
    templateId,
    slots: slotsOf(site, { templateId, note: noteOf(input), parts: partsOf(input), outputs }),
  }
}

const callVariant = (site: CallSite, outputs: OutputIndex): CallDetail => {
  const context = contextOf(site, outputs)
  const billing = billingOf(context)
  const attempts = ladderOf(site)?.attempts.length ?? 1
  return {
    id: site.column.callId,
    runId: site.runId,
    nodeId: nodeId(nodeIdOf(site.column)),
    kind: catalogNodeOf(site)?.kind ?? site.kind,
    branch: site.branch,
    stage: site.stage,
    row: site.row,
    attempt: attempts,
    attempts,
    totalCostUsd: billing.callTotalUsd,
    model: modelInfoOf(site),
    routing: routingOf(site),
    params: {
      temperature: site.column.agent?.config?.temperature ?? 0,
      top_p: 1,
      max_tokens: { value: 4096 },
      seed: null,
      stop: [],
      response_format: engineOf(site) === "model" ? "json_schema · strict" : NONE,
    },
    billing,
    input: callInputOf(context),
    prompt: CALL_PROMPT[engineOf(site)](context),
    output: callOutputOf(context),
    checks: checksOf(context),
  }
}

const groupSites = (base: SiteBase, group: MatrixGroup): readonly CallSite[] =>
  group.columns.flatMap((column) => {
    const site: CallSite = { ...base, column, group, branch: branchOf(column.name, base.branch), kind: column.kind ?? base.kind }
    const nested = column.child === undefined ? [] : groupSites(site, column.child.block.group)
    return [site, ...nested]
  })

const stageSites = (base: ScopeBase, stages: readonly StageRun[]): readonly CallSite[] =>
  stages.flatMap((stage, index) =>
    stage.groups.flatMap((group) =>
      groupSites({ ...base, stage: stage.ordinal ?? index + 1, ladder: stage.attempts, branch: MAIN_BRANCH, kind: "llm" }, group),
    ),
  )

const runSites = (sources: CallDetailSources): readonly (readonly CallSite[])[] =>
  Object.entries(sources.dataflowRuns).map(([key, dataflow]) => {
    const scope = scopeOf(key)
    const row = dataflow.metrics.assertions.failedRows[0] ?? FALLBACK_ROW
    return stageSites({ scope, runId: dataflow.run.id, row, dataset: datasetOf(scope, sources.testDetails) }, dataflow.stages)
  })

const traceSites = (sources: CallDetailSources): readonly (readonly CallSite[])[] =>
  Object.entries(sources.rowTraces).map(([key, trace]) => {
    const scope = scopeOf(key)
    const runId = sources.runLists[scope]?.[0]?.id ?? FALLBACK_RUN
    return stageSites({ scope, runId, row: trace.rowId, dataset: datasetOf(scope, sources.testDetails) }, trace.steps)
  })

const outputIndexOf = (sites: readonly CallSite[]): OutputIndex =>
  new Map(
    sites.flatMap((site): readonly (readonly [string, readonly string[]])[] => {
      const lines = outputLinesOf(site.column.output)
      if (lines.length === 0) return []
      return [
        [site.column.id, lines],
        [site.column.name, lines],
      ]
    }),
  )

const detailEntries = (sites: readonly CallSite[]): readonly (readonly [string, CallDetail])[] => {
  const outputs = outputIndexOf(sites)
  return sites.map((site): readonly [string, CallDetail] => [resourceKey(site.scope, site.column.callId), callVariant(site, outputs)])
}

export const deriveCallDetails = (sources: CallDetailSources): Readonly<Record<string, CallDetail>> =>
  Object.fromEntries([...traceSites(sources), ...runSites(sources)].flatMap(detailEntries))

export const callDetails: Readonly<Record<string, CallDetail>> = {
  ...deriveCallDetails({ dataflowRuns, rowTraces, runLists, testDetails }),
  [workflowKey(WORKFLOWS.pitchPipeline, CALL_01HT9.id)]: CALL_01HT9,
}
