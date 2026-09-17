import type {
  AnchorNode,
  CanvasStage,
  GatewayMode,
  GatewayNode,
  GroupNode,
  NodeHandle,
  NodeInspection,
  Property,
  Provenance,
  ProvenancedValue,
  SchemaEdge,
  SchemaGraph,
  SchemaNode,
  StepNode,
} from "@/domain"
import { nodeId } from "@/data/ids"
import { catalogNode, catalogOf, familyLabel, stageLabel, type CatalogNode, type CatalogStage } from "./catalog"
import { WORKFLOWS, workflowKey } from "./keys"

type Placement = { readonly x: number; readonly y: number; readonly parent?: string }
type StepData = StepNode["data"]
type StepLook = Omit<StepData, "name" | "kind" | "family">
type GroupData = GroupNode["data"]
type GroupSize = { readonly width: number; readonly height: number }
type Endpoint = readonly [id: string, handle: NodeHandle]
type EdgeExtras = { readonly label?: string; readonly detourY?: number }
type InspectionBody = Omit<NodeInspection, "id" | "kind" | "name">

const placement = ({ x, y, parent }: Placement): { readonly position: { x: number; y: number }; readonly parentId?: string } =>
  parent === undefined ? { position: { x, y } } : { parentId: parent, position: { x, y } }

const NO_MODEL = "—"

const familyOf = (node: CatalogNode): Pick<StepData, "family"> => (node.model === undefined ? {} : { family: node.model.family })

const modelOf = (node: CatalogNode): string => node.model?.model ?? NO_MODEL

const familyMeta = (node: CatalogNode): string => `${familyLabel(node.model?.family ?? "anthropic")} · ${modelOf(node)}`

const modelMeta = (node: CatalogNode, detail: string): string => `${modelOf(node)} · ${detail}`

const step = (workflow: string, id: string, at: Placement, look: StepLook & { readonly name?: string }): StepNode => {
  const name = look.name ?? id
  const node = catalogNode(workflow, name)
  return {
    type: "step",
    id: nodeId(id),
    ...placement(at),
    data: { ...look, kind: node.kind, ...familyOf(node), name },
  }
}

const pitchStep = (id: string, at: Placement, look: (node: CatalogNode) => StepLook, catalogId: string = id): StepNode =>
  step(WORKFLOWS.pitchPipeline, id, at, { ...look(catalogNode(WORKFLOWS.pitchPipeline, catalogId)), name: catalogId })

const group = (id: string, at: Placement, size: GroupSize, data: GroupData): GroupNode => ({
  type: "group",
  id,
  ...placement(at),
  ...size,
  data,
})

const gateway = (id: string, at: Placement, mode: GatewayMode): GatewayNode => ({ type: "gateway", id, ...placement(at), data: { mode } })

const anchor = (id: string, at: Placement): AnchorNode => ({ type: "anchor", id, ...placement(at) })

const edge = (id: string, [source, sourceHandle]: Endpoint, [target, targetHandle]: Endpoint, extras: EdgeExtras = {}): SchemaEdge => ({
  id,
  source,
  sourceHandle,
  target,
  targetHandle,
  variant: extras.detourY === undefined ? "flow" : "back",
  ...extras,
})

const properties = (pairs: readonly (readonly [string, string])[]): readonly Property[] => pairs.map(([key, value]) => ({ key, value }))

const inputs = (triples: readonly (readonly [Provenance, string, string])[]): readonly ProvenancedValue[] =>
  triples.map(([provenance, label, value]) => ({ provenance, label, value }))

const inspection = (workflow: string, id: string, body: (node: CatalogNode) => InspectionBody): NodeInspection => {
  const node = catalogNode(workflow, id)
  return { id: node.id, kind: node.kind, name: id, ...body(node) }
}

const pitchInspection = (id: string, body: (node: CatalogNode) => InspectionBody): NodeInspection =>
  inspection(WORKFLOWS.pitchPipeline, id, body)

const stageRow = (node: CatalogNode): readonly [string, string] => ["stage", stageLabel(node)]

const modelRows = (node: CatalogNode): readonly (readonly [string, string])[] => [
  ["family", familyLabel(node.model?.family ?? "anthropic")],
  ["model", modelOf(node)],
]

const chipOf = (stage: CatalogStage): string => `${String(stage.number)} ${stage.short}`

const titleOf = (stage: CatalogStage): string => `${String(stage.number)} · ${stage.title}`

const NOT_A_MODEL_CALL = "none — not a model call"
const TOOL_SLOTS = properties([["—", "tool takes typed arguments, not a prompt"]])
const FUNCTION_SLOTS = properties([["—", "pure function, no prompt"]])

const BRANCHES = [
  { key: "b2c", dy: 0, audience: "B2C · families" },
  { key: "b2b", dy: 548, audience: "B2B · corporate" },
  { key: "mice", dy: 1096, audience: "MICE" },
] as const

type Branch = (typeof BRANCHES)[number]

const SEGMENT_DETOUR_Y = 1598
const SEGMENT_OUT_X = 2070
const SEGMENT_OUT_Y = 392

const pitchGroups: readonly GroupNode[] = [
  group("grp.score_map", { x: 436, y: 334 }, { width: 672, height: 204 }, {
    kind: "map",
    caption: "score_hotel ×N · concurrency 8 · on_error skip",
    flowY: 126,
    fit: true,
  }),
  group("grp.families", { x: 1412, y: 76 }, { width: 352, height: 720 }, {
    kind: "diverge",
    caption: "4 families · join all",
    flowY: 384,
    fit: true,
  }),
  group("grp.critic_loop", { x: 2068, y: 114 }, { width: 1008, height: 644 }, {
    kind: "loop",
    caption: "critic_loop · score ≥ 0.90 · max 8 · $0.50 · select best",
    flowY: 346,
    fit: true,
  }),
  group("grp.judge_panel", { x: 56, y: 48, parent: "grp.critic_loop" }, { width: 352, height: 548 }, {
    kind: "parallel",
    caption: "judge_panel · quorum(2)",
    flowY: 298,
    fit: true,
  }),
  group("grp.asset_render", { x: 2120, y: 986 }, { width: 320, height: 452 }, {
    kind: "parallel",
    fanOut: 3,
    title: "Asset render",
    dashed: true,
    fit: true,
  }),
  group("sec.segments", { x: 2500, y: 1000 }, { width: 2150, height: 1788 }, {
    kind: "section",
    stage: catalogNode(WORKFLOWS.pitchPipeline, "persona_b2c").stage,
    title: "Segment personalization",
    caption: "depth 4: diverge ×3 → critic_loop in each branch → judge_panel ×3 → map ×3 inside the facts judge",
    fit: false,
  }),
  group("grp.seg_diverge", { x: 200, y: 90, parent: "sec.segments" }, { width: 1100, height: 1658 }, {
    kind: "diverge",
    caption: "diverge ×3 · audience segments · join all",
    flowY: 821,
    fit: true,
  }),
]

const branchGroups = ({ key, dy }: Branch): readonly GroupNode[] => [
  group(`grp.loop_${key}`, { x: 350, y: 34 + dy, parent: "grp.seg_diverge" }, { width: 700, height: 492 }, {
    kind: "loop",
    caption: `critic_loop · branch persona_${key} · threshold 0.90`,
    flowY: 268,
    fit: true,
  }),
  group(`grp.panel_${key}`, { x: 40, y: 72, parent: `grp.loop_${key}` }, { width: 300, height: 392 }, {
    kind: "parallel",
    caption: "judge_panel · quorum(2)",
    flowY: 196,
    fit: true,
  }),
  group(`grp.facts_map_${key}`, { x: 24, y: 160, parent: `grp.panel_${key}` }, { width: 252, height: 116 }, {
    kind: "map",
    caption: "map ×3 · facts",
    fit: true,
  }),
]

const pitchGateways: readonly GatewayNode[] = [
  gateway("gw.families_split", { x: 1238, y: 438 }, "all"),
  gateway("gw.families_join", { x: 1894, y: 438 }, "all"),
  gateway("gw.panel_join", { x: 538, y: 324, parent: "grp.critic_loop" }, "all"),
  gateway("gw.decision", { x: 3206, y: 438 }, "one"),
]

const pitchSteps: readonly StepNode[] = [
  pitchStep("load_hotels", { x: 56, y: 414 }, () => ({ meta: "hotels.search · read", io: ["in: Brief", "out: Hotel[]"], inspectable: true })),
  pitchStep("score_hotel", { x: 56, y: 80, parent: "grp.score_map" }, (node) => ({
    meta: modelMeta(node, "score_v3"),
    io: ["in: Hotel", "out: Score"],
    marker: "map-n",
    inspectable: true,
  })),
  pitchStep("rank_hotels", { x: 376, y: 80, parent: "grp.score_map" }, () => ({ meta: "rank_hotels() · pure", io: ["in: Score[]", "out: Ranked"], inspectable: true })),
  pitchStep("pitch_gen_a", { x: 56, y: 80, parent: "grp.families" }, (node) => ({ meta: familyMeta(node), io: ["persona: premium", "out: Pitch"], inspectable: true })),
  pitchStep("pitch_gen_b", { x: 56, y: 252, parent: "grp.families" }, (node) => ({ meta: familyMeta(node), io: ["persona: family", "out: Pitch"], inspectable: true })),
  pitchStep("pitch_gen_c", { x: 56, y: 424, parent: "grp.families" }, (node) => ({ meta: familyMeta(node), io: ["persona: budget", "out: Pitch"], inspectable: true })),
  pitchStep("pitch_gen_d", { x: 56, y: 596, parent: "grp.families" }, (node) => ({ meta: familyMeta(node), io: ["persona: business", "out: Pitch"], inspectable: true })),
  pitchStep("judge_style", { x: 56, y: 80, parent: "grp.judge_panel" }, (node) => ({
    meta: modelMeta(node, "judge_v2"),
    io: ["in: Pitch", "out: Verdict"],
    inspectable: true,
  })),
  pitchStep("judge_facts", { x: 56, y: 252, parent: "grp.judge_panel" }, (node) => ({
    meta: modelMeta(node, "judge_v2"),
    io: ["in: Pitch+Facts", "out: Verdict"],
    inspectable: true,
  })),
  pitchStep("judge_tone", { x: 56, y: 424, parent: "grp.judge_panel" }, (node) => ({
    meta: modelMeta(node, "judge_v2"),
    io: ["in: Pitch+Tone", "out: Verdict"],
    inspectable: true,
  })),
  pitchStep("fix_draft", { x: 712, y: 300, parent: "grp.critic_loop" }, (node) => ({
    meta: modelMeta(node, "fix_v4"),
    io: ["in: Pitch+Verdict[]", "out: Pitch"],
    marker: "loop",
    inspectable: true,
  })),
  pitchStep("publish_deck", { x: 3490, y: 194 }, () => ({ meta: "deck.publish · write", io: ["in: Pitch", "timeout 30 s"], inspectable: true })),
  pitchStep("decide_pitch", { x: 3490, y: 414 }, () => ({ meta: "SLA 4 h · escalate", io: ["@lead", "out: Verdict"], inspectable: true })),
  pitchStep("archive_draft", { x: 3490, y: 634 }, () => ({ meta: "archive_draft() · pure", io: ["in: Pitch", "out: void"], inspectable: true })),
  pitchStep("render_hero", { x: 40, y: 48, parent: "grp.asset_render" }, (node) => ({
    meta: modelMeta(node, "1536×1024"),
    io: ["in: Pitch+Photo[]", "out: Image"],
    marker: "image",
    inspectable: false,
  })),
  pitchStep("voice_pitch", { x: 40, y: 180, parent: "grp.asset_render" }, (node) => ({
    meta: modelMeta(node, "calm_f"),
    io: ["in: Pitch+Audio", "out: Audio"],
    marker: "audio",
    inspectable: false,
  })),
  pitchStep("cut_teaser", { x: 40, y: 312, parent: "grp.asset_render" }, (node) => ({
    meta: modelMeta(node, "1080×1920"),
    io: ["in: Image+Audio", "out: Video"],
    marker: "video",
    inspectable: false,
  })),
]

const personaSteps: readonly StepNode[] = BRANCHES.map(({ key, dy, audience }) =>
  pitchStep(`persona_${key}`, { x: 40, y: 260 + dy, parent: "grp.seg_diverge" }, (node) => ({
    meta: modelOf(node),
    io: [audience, "out: Pitch"],
    inspectable: false,
  })),
)

const branchSteps = ({ key }: Branch): readonly StepNode[] => [
  pitchStep(
    `judge_style_${key}`,
    { x: 40, y: 68, parent: `grp.panel_${key}` },
    (node) => ({ meta: modelOf(node), io: ["in: Pitch", "out: Verdict"], inspectable: false }),
    "judge_style",
  ),
  pitchStep(
    `judge_facts_${key}`,
    { x: 16, y: 16, parent: `grp.facts_map_${key}` },
    (node) => ({ meta: modelOf(node), io: ["in: Pitch", "out: Verdict"], marker: "map-fanout", inspectable: false }),
    "judge_facts",
  ),
  pitchStep(
    `judge_tone_${key}`,
    { x: 40, y: 284, parent: `grp.panel_${key}` },
    (node) => ({ meta: modelOf(node), io: ["in: Pitch", "out: Verdict"], inspectable: false }),
    "judge_tone",
  ),
  pitchStep(
    `fix_draft_${key}`,
    { x: 430, y: 226, parent: `grp.loop_${key}` },
    (node) => ({ meta: modelMeta(node, "fix_v4"), io: ["in: Pitch+Verdict[]", "out: Pitch"], marker: "loop", inspectable: false }),
    "fix_draft",
  ),
]

const segmentAnchors: readonly AnchorNode[] = [
  anchor("anchor.seg_in", { x: 100, y: 911, parent: "sec.segments" }),
  ...BRANCHES.map(({ key, dy }) => anchor(`anchor.seg_out_${key}`, { x: SEGMENT_OUT_X, y: SEGMENT_OUT_Y + dy, parent: "sec.segments" })),
]

const pitchNodes: readonly SchemaNode[] = [
  ...pitchGroups,
  ...BRANCHES.flatMap(branchGroups),
  ...pitchGateways,
  ...pitchSteps,
  ...personaSteps,
  ...BRANCHES.flatMap(branchSteps),
  ...segmentAnchors,
]

const pitchEdges: readonly SchemaEdge[] = [
  edge("e1", ["load_hotels", "out"], ["grp.score_map", "in"]),
  edge("e2", ["score_hotel", "out"], ["rank_hotels", "in"]),
  edge("e3", ["grp.score_map", "out"], ["gw.families_split", "in"]),
  edge("e4", ["gw.families_split", "out"], ["grp.families", "in"]),
  edge("e5", ["grp.families", "enter"], ["pitch_gen_a", "in"]),
  edge("e6", ["grp.families", "enter"], ["pitch_gen_b", "in"]),
  edge("e7", ["grp.families", "enter"], ["pitch_gen_c", "in"]),
  edge("e8", ["grp.families", "enter"], ["pitch_gen_d", "in"]),
  edge("e9", ["pitch_gen_a", "out"], ["grp.families", "exit"]),
  edge("e10", ["pitch_gen_b", "out"], ["grp.families", "exit"]),
  edge("e11", ["pitch_gen_c", "out"], ["grp.families", "exit"]),
  edge("e12", ["pitch_gen_d", "out"], ["grp.families", "exit"]),
  edge("e13", ["grp.families", "out"], ["gw.families_join", "in"]),
  edge("e14", ["gw.families_join", "out"], ["grp.critic_loop", "in"]),
  edge("e15", ["grp.critic_loop", "enter"], ["grp.judge_panel", "in"]),
  edge("e16", ["grp.judge_panel", "enter"], ["judge_style", "in"]),
  edge("e17", ["grp.judge_panel", "enter"], ["judge_tone", "in"]),
  edge("e18", ["grp.judge_panel", "enter"], ["judge_facts", "in"]),
  edge("e19", ["judge_style", "out"], ["grp.judge_panel", "exit"]),
  edge("e20", ["judge_tone", "out"], ["grp.judge_panel", "exit"]),
  edge("e21", ["judge_facts", "out"], ["grp.judge_panel", "exit"]),
  edge("e22", ["grp.judge_panel", "out"], ["gw.panel_join", "in"]),
  edge("e23", ["gw.panel_join", "out"], ["fix_draft", "in"]),
  edge("e24", ["fix_draft", "out"], ["grp.critic_loop", "exit"]),
  edge("e25", ["grp.critic_loop", "out"], ["gw.decision", "in"], { label: "verdict" }),
  edge("e26", ["gw.decision", "out"], ["publish_deck", "in"], { label: "approved" }),
  edge("e27", ["gw.decision", "out"], ["decide_pitch", "in"], { label: "needs_human" }),
  edge("e28", ["gw.decision", "out"], ["archive_draft", "in"], { label: "rejected" }),
  edge("e29", ["fix_draft", "bottom"], ["grp.critic_loop", "in"], { label: "back edge · repeat while score < 0.90", detourY: 880 }),
]

const branchEdges = ({ key, dy }: Branch): readonly SchemaEdge[] => [
  edge(`s1_${key}`, ["anchor.seg_in", "out"], [`persona_${key}`, "in"]),
  edge(`s2_${key}`, [`persona_${key}`, "out"], [`grp.loop_${key}`, "in"]),
  edge(`s3_${key}`, [`grp.loop_${key}`, "enter"], [`grp.panel_${key}`, "in"]),
  edge(`s4_${key}`, [`grp.panel_${key}`, "enter"], [`judge_style_${key}`, "in"]),
  edge(`s5_${key}`, [`grp.panel_${key}`, "enter"], [`judge_facts_${key}`, "in"]),
  edge(`s6_${key}`, [`grp.panel_${key}`, "enter"], [`judge_tone_${key}`, "in"]),
  edge(`s7_${key}`, [`judge_style_${key}`, "out"], [`grp.panel_${key}`, "exit"]),
  edge(`s8_${key}`, [`judge_facts_${key}`, "out"], [`grp.panel_${key}`, "exit"]),
  edge(`s9_${key}`, [`judge_tone_${key}`, "out"], [`grp.panel_${key}`, "exit"]),
  edge(`s10_${key}`, [`grp.panel_${key}`, "out"], [`fix_draft_${key}`, "in"]),
  edge(`s11_${key}`, [`fix_draft_${key}`, "out"], [`anchor.seg_out_${key}`, "in"]),
  edge(`s12_${key}`, [`fix_draft_${key}`, "bottom"], [`grp.loop_${key}`, "in"], { detourY: SEGMENT_DETOUR_Y + dy }),
]

const PITCH_STAGE_RECTS: Readonly<Record<string, CanvasStage["rect"]>> = {
  data_load: { x: 36, y: 376, width: 284, height: 128 },
  hotel_scoring: { x: 420, y: 318, width: 372, height: 236 },
  score_reduce: { x: 792, y: 318, width: 332, height: 236 },
  pitch_divergence: { x: 1222, y: 60, width: 558, height: 752 },
  critic_loop: { x: 1878, y: 98, width: 1214, height: 810 },
  asset_render: { x: 2120, y: 986, width: 320, height: 452 },
  pitch_decision: { x: 3190, y: 178, width: 556, height: 560 },
}

const NO_RECT: CanvasStage["rect"] = { x: 0, y: 0, width: 0, height: 0 }

const canvasStage = (stage: CatalogStage, rect: CanvasStage["rect"]): CanvasStage => ({
  number: stage.number,
  chip: chipOf(stage),
  title: titleOf(stage),
  rect,
})

const pitchStages: readonly CanvasStage[] = catalogOf(WORKFLOWS.pitchPipeline).stages.map((stage) =>
  canvasStage(stage, PITCH_STAGE_RECTS[stage.id] ?? NO_RECT),
)

const pitchGraph: SchemaGraph = {
  nodes: pitchNodes,
  edges: [...pitchEdges, ...BRANCHES.flatMap(branchEdges)],
  stages: pitchStages,
}

const PITCH_PROMPT =
  "You are writing a hotel pitch for the audience $persona.\n\nTone and bans:\n$tone.chunks\n\nCandidates (ranked):\n$ranked.items[0..2]\n\nFacts to check:\n$facts\n\nFrom the client: $brief_extra"

const PITCH_OUTPUT_TYPE = "Pitch · strict\n{\n  title: string ≤ 90,\n  body: string,\n  hooks: string[3]   // minLength 1\n}\nadditionalProperties: false"

const VERDICT_OUTPUT_TYPE = "Verdict\n{ verdict: accept | needs_human | reject, score: 0..1, remark: string }"

type PitchVariant = {
  readonly id: string
  readonly persona: string
  readonly fallback: string | null
  readonly maxTokens: string
  readonly cost: string
}

const profileOf = (node: CatalogNode): string => `${node.model?.family ?? "anthropic"}/${modelOf(node)}`

const pitchVariantSource = (node: CatalogNode, { id, fallback, maxTokens }: PitchVariant): string =>
  [
    `- id: ${id}`,
    "  kind: llm",
    "  agent: pitch_writer",
    `  model: ${profileOf(node)}`,
    "  prompt: pitch_v7",
    "  output: Pitch",
    "  temperature: 0.9",
    `  max_tokens: ${maxTokens}`,
    ...(fallback === null ? [] : [`  fallback_profile: ${fallback}`]),
  ].join("\n")

const pitchInputs = (persona: string): readonly ProvenancedValue[] =>
  inputs([
    ["generated", "ranked.items[0..2]", "$rank_hotels.out"],
    ["data", "facts", "$load_hotels.out"],
    ["knowledge", "tone.chunks", "brand_voice v4 · 4 chunks"],
    ["static", "persona", `"${persona}" · static`],
    ["human", "brief_extra", "@lead · human"],
    ["static", "format", "from the Pitch type"],
  ])

const pitchSlots = (persona: string): readonly Property[] =>
  properties([
    ["$persona", `static · "${persona}"`],
    ["$tone.chunks", "knowledge · brand_voice v4"],
    ["$ranked.items", "← rank_hotels.out"],
    ["$facts", "← load_hotels.out"],
    ["$brief_extra", "human · @lead"],
  ])

const pitchVariant = (variant: PitchVariant): NodeInspection =>
  pitchInspection(variant.id, (node) => ({
    overview: properties([
      ["kind", "llm"],
      ["name", variant.id],
      stageRow(node),
      ["agent", "pitch_writer"],
      ...modelRows(node),
      ["fallback", variant.fallback?.split("/")[1] ?? "—"],
    ]),
    config: properties([
      ["temperature", "0.9 · agent"],
      ["max_tokens", `${variant.maxTokens} · agent`],
      ["reasoning", "medium"],
      ["seed", "1337"],
      ["timeout", "60 s"],
      ["retry", "429 → backoff"],
      ["cost", variant.cost],
    ]),
    inputs: pitchInputs(variant.persona),
    prompt: PITCH_PROMPT,
    slots: pitchSlots(variant.persona),
    outputType: PITCH_OUTPUT_TYPE,
    source: pitchVariantSource(node, variant),
  }))

type JudgeVariant = {
  readonly id: string
  readonly checks: string
  readonly cost: string
  readonly reference: readonly [label: string, value: string]
  readonly instruction: string
}

const judgeVariant = (variant: JudgeVariant): NodeInspection => {
  const [referenceLabel, referenceValue] = variant.reference
  return pitchInspection(variant.id, (node) => ({
    overview: properties([
      ["kind", "llm · judge"],
      ["name", variant.id],
      stageRow(node),
      ["agent", node.model?.profile ?? variant.id],
      ...modelRows(node),
      ["checks", variant.checks],
    ]),
    config: properties([
      ["temperature", "0 · agent"],
      ["max_tokens", "1024"],
      ["reasoning", "off"],
      ["cost", variant.cost],
    ]),
    inputs: inputs([
      ["generated", "draft", "$fix_draft.out · Pitch"],
      ["knowledge", referenceLabel, referenceValue],
    ]),
    prompt: `${variant.instruction}\n\nDraft:\n$draft\n\nReference:\n$${referenceLabel}\n\nReturn { verdict, score, remark }.`,
    slots: properties([
      ["$draft", "← fix_draft.out"],
      [`$${referenceLabel}`, `knowledge · ${referenceValue}`],
    ]),
    outputType: VERDICT_OUTPUT_TYPE,
    source: [`- id: ${variant.id}`, "  kind: llm", `  agent: ${node.model?.profile ?? variant.id}`, `  model: ${profileOf(node)}`, "  prompt: judge_v2", "  output: Verdict"].join("\n"),
  }))
}

const pitchInspections: readonly NodeInspection[] = [
  pitchInspection("load_hotels", (node) => ({
    overview: properties([
      ["kind", "tool"],
      ["name", "load_hotels"],
      stageRow(node),
      ["adapter", "hotels.search"],
      ["mode", "read"],
      ["agent", "none · deterministic"],
    ]),
    config: properties([
      ["timeout", "20 s · default"],
      ["retry", "2 · on 5xx"],
      ["cache", "60 s · hit in run #8247"],
      ["cost", "$0.0000 · no tokens"],
    ]),
    inputs: inputs([
      ["static", "city", '"Sochi" · static'],
      ["static", "nights", "3 · static"],
      ["human", "constraints", '"no nightclubs" · human'],
    ]),
    prompt: NOT_A_MODEL_CALL,
    slots: TOOL_SLOTS,
    outputType: "Hotel[] · 10 items\n{ name, rating, beach_m, pool, kids_club, rooms, price }",
    source:
      '- id: load_hotels\n  kind: tool\n  adapter: hotels.search\n  input:\n    city: "Sochi"\n    nights: 3\n    constraints: $human.constraints\n  output: Hotel[]',
  })),
  pitchInspection("score_hotel", (node) => ({
    overview: properties([
      ["kind", "llm · map ×N"],
      ["name", "score_hotel"],
      stageRow(node),
      ["agent", node.model?.profile ?? "scorer_fast"],
      ...modelRows(node),
      ["concurrency", "8 · on_error skip"],
    ]),
    config: properties([
      ["temperature", "0.2 · agent"],
      ["max_tokens", "512 · agent"],
      ["reasoning", "off"],
      ["response_format", "json_schema · strict"],
      ["cost", "$0.0192 · 10 calls"],
    ]),
    inputs: inputs([
      ["data", "hotel", "$load_hotels.out[i] · Hotel"],
      ["static", "criteria", "scoring rubric v3 · static"],
    ]),
    prompt: "Score this hotel against the rubric.\n\nHotel:\n$hotel\n\nRubric:\n$criteria\n\nReturn { value: 0..1, why: string }.",
    slots: properties([
      ["$hotel", "← load_hotels.out[i]"],
      ["$criteria", "static · rubric v3"],
    ]),
    outputType: "Score\n{ value: number 0..1, why: string ≤ 120 }",
    source: `- id: score_hotel\n  kind: llm\n  agent: scorer_fast\n  model: ${profileOf(node)}\n  prompt: score_v3\n  map: $load_hotels.out\n  concurrency: 8\n  output: Score`,
  })),
  pitchInspection("rank_hotels", (node) => ({
    overview: properties([
      ["kind", "pure function"],
      ["name", "rank_hotels"],
      stageRow(node),
      ["agent", "none · deterministic"],
      ["impl", "rank_hotels()"],
    ]),
    config: properties([
      ["duration", "0.04 s"],
      ["tokens", "—"],
      ["cost", "$0.0000"],
      ["deterministic", "yes · same input, same output"],
    ]),
    inputs: inputs([["generated", "scores", "$score_hotel[0…9] · Score[]"]]),
    prompt: NOT_A_MODEL_CALL,
    slots: FUNCTION_SLOTS,
    outputType: "Ranked · 10 → top 3\n{ items: [{ hotel, value }], cutoff: 0.8 }",
    source: "- id: rank_hotels\n  kind: fn\n  impl: rank_hotels\n  input: $score_hotel[*]\n  output: Ranked",
  })),
  pitchVariant({ id: "pitch_gen_a", persona: "premium", fallback: "anthropic/haiku-4.5", maxTokens: "4096", cost: "$0.0214 · 1 attempt" }),
  pitchInspection("pitch_gen_b", (node) => ({
    overview: properties([
      ["kind", "llm"],
      ["name", "pitch_gen_b"],
      stageRow(node),
      ["agent", "pitch_writer"],
      ...modelRows(node),
      ["fallback", "gpt-5.1-mini"],
    ]),
    config: properties([
      ["temperature", "0.9 · agent"],
      ["max_tokens", "8192 · r42"],
      ["reasoning", "medium"],
      ["seed", "1337"],
      ["timeout", "60 s"],
      ["retry", "429 → backoff"],
      ["cost", "$0.0611 · 4 attempts"],
    ]),
    inputs: pitchInputs("family"),
    prompt: PITCH_PROMPT,
    slots: pitchSlots("family"),
    outputType: PITCH_OUTPUT_TYPE,
    source: `- id: pitch_gen_b\n  kind: llm\n  agent: pitch_writer\n  model: ${profileOf(node)}\n  prompt: pitch_v7\n  output: Pitch\n  temperature: 0.9\n  max_tokens: 8192   # r42\n  fallback_profile: openai/gpt-5.1-mini`,
  })),
  pitchVariant({ id: "pitch_gen_c", persona: "budget", fallback: "google/gemini-3-flash", maxTokens: "4096", cost: "$0.0106 · 1 attempt" }),
  pitchVariant({ id: "pitch_gen_d", persona: "business", fallback: null, maxTokens: "4096", cost: "$0.0112 · 1 attempt" }),
  judgeVariant({
    id: "judge_style",
    checks: "tone, bans, rhythm",
    cost: "$0.0041 per call",
    reference: ["bans", "brand_voice v4 · bans"],
    instruction: "Check the draft for tone, banned words and sentence rhythm.",
  }),
  pitchInspection("judge_facts", (node) => ({
    overview: properties([
      ["kind", "llm · judge"],
      ["name", "judge_facts"],
      stageRow(node),
      ["agent", node.model?.profile ?? "judge_grounding"],
      ...modelRows(node),
    ]),
    config: properties([
      ["temperature", "0 · agent"],
      ["max_tokens", "1024"],
      ["reasoning", "off"],
      ["map", "×3 · one per claim"],
      ["cost", "$0.0028 per call"],
    ]),
    inputs: inputs([
      ["generated", "draft", "$fix_draft.out · Pitch"],
      ["data", "facts", "$load_hotels.out"],
    ]),
    prompt: "Check every number and claim in the draft against the facts.\n\nDraft:\n$draft\n\nFacts:\n$facts\n\nReturn { verdict, score, remark }.",
    slots: properties([
      ["$draft", "← fix_draft.out"],
      ["$facts", "← load_hotels.out"],
    ]),
    outputType: VERDICT_OUTPUT_TYPE,
    source: `- id: judge_facts\n  kind: llm\n  agent: judge_grounding\n  model: ${profileOf(node)}\n  prompt: judge_v2\n  map: claims($draft)\n  output: Verdict`,
  })),
  judgeVariant({
    id: "judge_tone",
    checks: "brand voice v4",
    cost: "$0.0019 per call",
    reference: ["tone.chunks", "brand_voice v4 · 4 chunks"],
    instruction: "Compare the voice of the draft with the brand voice chunks.",
  }),
  pitchInspection("fix_draft", (node) => ({
    overview: properties([
      ["kind", "llm · loop body"],
      ["name", "fix_draft"],
      stageRow(node),
      ["agent", node.model?.profile ?? "fix_writer"],
      ...modelRows(node),
      ["loop", "max 8 · stop on stagnation"],
    ]),
    config: properties([
      ["temperature", "0.6"],
      ["max_tokens", "4096"],
      ["reasoning", "medium"],
      ["budget", "$0.50 per loop"],
      ["cost", "$0.0311 per iteration"],
    ]),
    inputs: inputs([
      ["generated", "draft", "previous iteration · Pitch"],
      ["generated", "verdicts", "$judge_panel.out · Verdict[]"],
    ]),
    prompt: "Rewrite the draft using the judge remarks. Change only what the remarks demand.\n\nDraft:\n$draft\n\nRemarks:\n$verdicts",
    slots: properties([
      ["$draft", "← previous iteration"],
      ["$verdicts", "← judge_panel.out"],
    ]),
    outputType: "Pitch · same type as the draft",
    source: `- id: fix_draft\n  kind: llm\n  agent: fix_writer\n  model: ${profileOf(node)}\n  prompt: fix_v4\n  loop:\n    until: score >= 0.90\n    max: 8\n    budget: $0.50`,
  })),
  pitchInspection("publish_deck", (node) => ({
    overview: properties([
      ["kind", "tool"],
      ["name", "publish_deck"],
      stageRow(node),
      ["adapter", "deck.publish"],
      ["mode", "write"],
      ["state", "not called · waiting on human"],
    ]),
    config: properties([
      ["timeout", "30 s"],
      ["retry", "0 · write is not idempotent"],
      ["cache", "off · write"],
      ["cost", "$0.0000 · no tokens"],
    ]),
    inputs: inputs([
      ["generated", "pitch", "$critic_loop.best · Pitch"],
      ["human", "decision", "$decide_pitch.out · approve"],
    ]),
    prompt: NOT_A_MODEL_CALL,
    slots: TOOL_SLOTS,
    outputType: "DeckRef\n{ url: string, version: number }",
    source:
      "- id: publish_deck\n  kind: tool\n  adapter: deck.publish\n  when: $decide_pitch.decision == approve\n  input:\n    pitch: $critic_loop.best\n  timeout: 30s\n  output: DeckRef",
  })),
  pitchInspection("decide_pitch", (node) => ({
    overview: properties([
      ["kind", "human step"],
      ["name", "decide_pitch"],
      stageRow(node),
      ["assignee", "@lead"],
      ["sla", "4 h · then escalate"],
      ["state", "waiting 12 m"],
    ]),
    config: properties([
      ["form", "review_form r3"],
      ["on timeout", "escalate to @head"],
      ["on reject", "branch dropped"],
      ["cost", "$0.0000"],
    ]),
    inputs: inputs([
      ["generated", "best_pitch", "$critic_loop.best · Pitch"],
      ["generated", "verdicts", "$judge_panel.out · Verdict[]"],
    ]),
    prompt: "review_form r3 — shown to the reviewer, not to a model",
    slots: properties([
      ["$best_pitch", "← critic_loop.best"],
      ["$verdicts", "← judge_panel.out"],
    ]),
    outputType: "Decision\n{ decision: approve | changes | reject, note: string }",
    source: '- id: decide_pitch\n  kind: human\n  assignee: "@lead"\n  form: review_form\n  sla: 4h\n  on_timeout: escalate',
  })),
  pitchInspection("archive_draft", (node) => ({
    overview: properties([
      ["kind", "pure function"],
      ["name", "archive_draft"],
      stageRow(node),
      ["impl", "archive_draft()"],
      ["state", "not called"],
    ]),
    config: properties([
      ["duration", "—"],
      ["tokens", "—"],
      ["cost", "$0.0000"],
      ["deterministic", "yes · same input, same output"],
    ]),
    inputs: inputs([["generated", "draft", "$critic_loop.best · Pitch"]]),
    prompt: NOT_A_MODEL_CALL,
    slots: FUNCTION_SLOTS,
    outputType: "void",
    source: "- id: archive_draft\n  kind: fn\n  impl: archive_draft\n  when: $decide_pitch.decision == reject\n  input: $critic_loop.best\n  output: void",
  })),
]

type LinearStep = {
  readonly id: string
  readonly look: (node: CatalogNode) => Omit<StepLook, "inspectable">
  readonly inspection: (node: CatalogNode) => InspectionBody
}

type LinearWorkflow = { readonly workflow: string; readonly steps: readonly LinearStep[] }

const LINEAR_ORIGIN_X = 56
const LINEAR_STEP_X = 340
const LINEAR_Y = 414
const STAGE_INSET = 20
const STAGE_TOP = 376
const STAGE_WIDTH = 280
const STAGE_HEIGHT = 168

const linearX = (index: number): number => LINEAR_ORIGIN_X + index * LINEAR_STEP_X

const linearRect = (index: number): CanvasStage["rect"] => ({ x: linearX(index) - STAGE_INSET, y: STAGE_TOP, width: STAGE_WIDTH, height: STAGE_HEIGHT })

const linearGraph = ({ workflow, steps }: LinearWorkflow): SchemaGraph => ({
  nodes: steps.map(({ id, look }, index) =>
    step(workflow, id, { x: linearX(index), y: LINEAR_Y }, { ...look(catalogNode(workflow, id)), inspectable: true }),
  ),
  edges: steps.flatMap((current, index) => {
    const next = steps[index + 1]
    if (next === undefined) return []
    return [edge(`e${String(index + 1)}`, [current.id, "out"], [next.id, "in"])]
  }),
  stages: catalogOf(workflow).stages.map((stage, index) => canvasStage(stage, linearRect(index))),
})

const linearInspections = ({ workflow, steps }: LinearWorkflow): readonly NodeInspection[] =>
  steps.map((entry) => inspection(workflow, entry.id, entry.inspection))

const toolOverview = (node: CatalogNode, adapter: string, mode: string, state = "none · deterministic"): readonly Property[] =>
  properties([["kind", "tool"], ["name", node.id], stageRow(node), ["adapter", adapter], ["mode", mode], ["agent", state]])

const functionOverview = (node: CatalogNode): readonly Property[] =>
  properties([["kind", "pure function"], ["name", node.id], stageRow(node), ["agent", "none · deterministic"], ["impl", `${node.id}()`]])

const modelOverview = (node: CatalogNode, kind = "llm"): readonly Property[] =>
  properties([["kind", kind], ["name", node.id], stageRow(node), ["agent", node.model?.profile ?? node.id], ...modelRows(node)])

const functionConfig = (duration: string): readonly Property[] =>
  properties([["duration", duration], ["tokens", "—"], ["cost", "$0.0000"], ["deterministic", "yes · same input, same output"]])

const SEO_BRIEF_WRITER: LinearWorkflow = {
  workflow: WORKFLOWS.seoBriefWriter,
  steps: [
    {
      id: "fetch_serp",
      look: () => ({ meta: "serp.search · read", io: ["in: Topic", "out: Keyword[]"] }),
      inspection: (node) => ({
        overview: toolOverview(node, "serp.search", "read"),
        config: properties([["timeout", "15 s · default"], ["retry", "2 · on 5xx"], ["cache", "24 h · hit in run #8102"], ["cost", "$0.0000 · no tokens"]]),
        inputs: inputs([["static", "topic", '"family hotels sochi" · static'], ["static", "locale", '"ru-RU" · static']]),
        prompt: NOT_A_MODEL_CALL,
        slots: TOOL_SLOTS,
        outputType: "Keyword[] · 24 items\n{ term, volume, intent }",
        source: '- id: fetch_serp\n  kind: tool\n  adapter: serp.search\n  input:\n    topic: "family hotels sochi"\n    locale: "ru-RU"\n  output: Keyword[]',
      }),
    },
    {
      id: "cluster_keywords",
      look: () => ({ meta: "cluster_keywords() · pure", io: ["in: Keyword[]", "out: Cluster[]"] }),
      inspection: (node) => ({
        overview: functionOverview(node),
        config: functionConfig("0.03 s"),
        inputs: inputs([["generated", "keywords", "$fetch_serp.out · Keyword[]"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: FUNCTION_SLOTS,
        outputType: "Keyword[] · clustered\n{ cluster, terms: string[] }",
        source: "- id: cluster_keywords\n  kind: fn\n  impl: cluster_keywords\n  input: $fetch_serp.out\n  output: Keyword[]",
      }),
    },
    {
      id: "draft_brief",
      look: (node) => ({ meta: familyMeta(node), io: ["in: Keyword[]", "out: Brief"] }),
      inspection: (node) => ({
        overview: modelOverview(node),
        config: properties([["temperature", "0.7 · agent"], ["max_tokens", "4096 · agent"], ["reasoning", "low"], ["timeout", "60 s"], ["cost", "$0.0948 · 1 call"]]),
        inputs: inputs([["static", "topic", '"family hotels sochi" · static'], ["generated", "clusters", "$cluster_keywords.out"], ["human", "audience", "@editor · human"]]),
        prompt: "Write an SEO brief grounded in the keyword clusters.\n\nTopic: $topic\n\nClusters:\n$clusters\n\nAudience: $audience",
        slots: properties([["$topic", 'static · "family hotels sochi"'], ["$clusters", "← cluster_keywords.out"], ["$audience", "human · @editor"]]),
        outputType: "Brief\n{ title: string, outline: string[], keywords: string[] }",
        source: `- id: draft_brief\n  kind: llm\n  agent: brief_writer\n  model: ${profileOf(node)}\n  prompt: write_brief_v2\n  output: Brief`,
      }),
    },
    {
      id: "check_brief",
      look: (node) => ({ meta: familyMeta(node), io: ["in: Brief", "out: Verdict"] }),
      inspection: (node) => ({
        overview: modelOverview(node, "llm · judge"),
        config: properties([["temperature", "0 · agent"], ["max_tokens", "1024"], ["reasoning", "off"], ["cost", "$0.0292 · 1 call"]]),
        inputs: inputs([["generated", "brief", "$draft_brief.out · Brief"], ["generated", "clusters", "$cluster_keywords.out"]]),
        prompt: "Check that the brief covers every cluster and flag keyword stuffing.\n\nBrief:\n$brief\n\nClusters:\n$clusters\n\nReturn { verdict, score, remark }.",
        slots: properties([["$brief", "← draft_brief.out"], ["$clusters", "← cluster_keywords.out"]]),
        outputType: VERDICT_OUTPUT_TYPE,
        source: `- id: check_brief\n  kind: llm\n  agent: brief_judge\n  model: ${profileOf(node)}\n  prompt: check_brief_v1\n  output: Verdict`,
      }),
    },
  ],
}

const REVIEW_SUMMARIZER: LinearWorkflow = {
  workflow: WORKFLOWS.reviewSummarizer,
  steps: [
    {
      id: "load_reviews",
      look: () => ({ meta: "reviews.fetch · read", io: ["in: HotelId", "out: Review[]"] }),
      inspection: (node) => ({
        overview: toolOverview(node, "reviews.fetch", "read"),
        config: properties([["timeout", "20 s · default"], ["retry", "2 · on 5xx"], ["cache", "6 h · miss in run #7980"], ["cost", "$0.0000 · no tokens"]]),
        inputs: inputs([["static", "hotel_id", '"riviera_sochi" · static'], ["static", "limit", "20 · static"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: TOOL_SLOTS,
        outputType: "Review[] · 20 items\n{ author, rating, text, date }",
        source: '- id: load_reviews\n  kind: tool\n  adapter: reviews.fetch\n  input:\n    hotel_id: "riviera_sochi"\n    limit: 20\n  output: Review[]',
      }),
    },
    {
      id: "summarize_review",
      look: (node) => ({ meta: modelMeta(node, "summary_v3"), io: ["in: Review", "out: Summary"], marker: "map-n" }),
      inspection: (node) => ({
        overview: modelOverview(node, "llm · map ×N"),
        config: properties([["temperature", "0.3 · agent"], ["max_tokens", "256 · agent"], ["reasoning", "off"], ["concurrency", "10 · on_error skip"], ["cost", "$0.0870 · 20 calls"]]),
        inputs: inputs([["data", "review", "$load_reviews.out[i] · Review"], ["knowledge", "style", "brand_voice v4 · 2 chunks"]]),
        prompt: "Summarize the review in one sentence and label the sentiment.\n\nReview:\n$review\n\nStyle:\n$style",
        slots: properties([["$review", "← load_reviews.out[i]"], ["$style", "knowledge · brand_voice v4"]]),
        outputType: "Summary\n{ text: string, sentiment: positive | mixed | negative }",
        source: `- id: summarize_review\n  kind: llm\n  agent: summarizer_fast\n  model: ${profileOf(node)}\n  prompt: summary_v3\n  map: $load_reviews.out\n  concurrency: 10\n  output: Summary`,
      }),
    },
    {
      id: "merge_summaries",
      look: () => ({ meta: "merge_summaries() · pure", io: ["in: Summary[]", "out: Summary"] }),
      inspection: (node) => ({
        overview: functionOverview(node),
        config: functionConfig("0.03 s"),
        inputs: inputs([["generated", "summaries", "$summarize_review[*] · Summary[]"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: FUNCTION_SLOTS,
        outputType: "Summary · digest\n{ text: string, sentiment: positive | mixed | negative }",
        source: "- id: merge_summaries\n  kind: fn\n  impl: merge_summaries\n  input: $summarize_review[*]\n  output: Summary",
      }),
    },
  ],
}

const NOT_RUN = "— · not run yet"

const SUPPORT_TRIAGE: LinearWorkflow = {
  workflow: WORKFLOWS.supportTriage,
  steps: [
    {
      id: "load_ticket",
      look: () => ({ meta: "helpdesk.read · read", io: ["in: TicketId", "out: Ticket"] }),
      inspection: (node) => ({
        overview: toolOverview(node, "helpdesk.read", "read"),
        config: properties([["timeout", "10 s · default"], ["retry", "2 · on 5xx"], ["cache", "off · not run yet"], ["cost", "$0.0000 · no tokens"]]),
        inputs: inputs([["human", "ticket_id", "@support · ticket field"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: TOOL_SLOTS,
        outputType: "Ticket\n{ id, subject, body, customer_email }",
        source: "- id: load_ticket\n  kind: tool\n  adapter: helpdesk.read\n  input:\n    ticket_id: $human.ticket_id\n  output: Ticket",
      }),
    },
    {
      id: "classify_ticket",
      look: (node) => ({ meta: familyMeta(node), io: ["in: Ticket", "out: Category"] }),
      inspection: (node) => ({
        overview: modelOverview(node),
        config: properties([["temperature", "0 · agent"], ["max_tokens", "256 · agent"], ["reasoning", "off"], ["response_format", "json_schema · strict"], ["cost", NOT_RUN]]),
        inputs: inputs([["data", "ticket", "$load_ticket.out"], ["static", "taxonomy", "support taxonomy v6 · static"]]),
        prompt: "Pick one category from $taxonomy and a confidence.\n\nTicket:\n$ticket\n\nReturn { category, confidence }.",
        slots: properties([["$ticket", "← load_ticket.out"], ["$taxonomy", "static · taxonomy v6"]]),
        outputType: "Category\n{ category: billing | booking | complaint | other, confidence: 0..1 }",
        source: `- id: classify_ticket\n  kind: llm\n  agent: triage_fast\n  model: ${profileOf(node)}\n  prompt: classify_ticket_v4\n  output: Category`,
      }),
    },
    {
      id: "detect_language",
      look: () => ({ meta: "detect_language() · pure", io: ["in: Ticket", "out: Locale"] }),
      inspection: (node) => ({
        overview: functionOverview(node),
        config: functionConfig("—"),
        inputs: inputs([["data", "ticket", "$load_ticket.out · Ticket"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: FUNCTION_SLOTS,
        outputType: "Locale\n{ code: string, confidence: number }",
        source: "- id: detect_language\n  kind: fn\n  impl: detect_language\n  input: $load_ticket.out\n  output: Locale",
      }),
    },
    {
      id: "route_queue",
      look: () => ({ meta: "route_queue() · switch", io: ["in: Category", "out: Queue"] }),
      inspection: (node) => ({
        overview: functionOverview(node),
        config: functionConfig("—"),
        inputs: inputs([["generated", "category", "$classify_ticket.out · Category"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: FUNCTION_SLOTS,
        outputType: "Category · routed\n{ queue: string }",
        source: "- id: route_queue\n  kind: fn\n  impl: route_queue\n  input: $classify_ticket.out\n  output: Category",
      }),
    },
    {
      id: "lookup_account",
      look: () => ({ meta: "crm.lookup · read", io: ["in: Ticket", "out: Account"] }),
      inspection: (node) => ({
        overview: toolOverview(node, "crm.lookup", "read"),
        config: properties([["timeout", "10 s · default"], ["retry", "2 · on 5xx"], ["cache", "5 m · not run yet"], ["cost", "$0.0000 · no tokens"]]),
        inputs: inputs([["data", "email", "$load_ticket.out.customer_email"]]),
        prompt: NOT_A_MODEL_CALL,
        slots: TOOL_SLOTS,
        outputType: "Account\n{ id, plan, bookings, lifetime_value }",
        source: "- id: lookup_account\n  kind: tool\n  adapter: crm.lookup\n  input:\n    email: $load_ticket.out.customer_email\n  output: Account",
      }),
    },
    {
      id: "draft_reply",
      look: (node) => ({ meta: familyMeta(node), io: ["in: Ticket+Account", "out: Reply"], marker: "loop" }),
      inspection: (node) => ({
        overview: [...modelOverview(node, "llm · loop body"), { key: "loop", value: "max 3 · until tone ≥ 0.85" }],
        config: properties([["temperature", "0.6 · agent"], ["max_tokens", "2048 · agent"], ["reasoning", "low"], ["timeout", "45 s"], ["cost", NOT_RUN]]),
        inputs: inputs([
          ["data", "ticket", "$load_ticket.out"],
          ["generated", "category", "$route_queue.out"],
          ["data", "account", "$lookup_account.out"],
          ["knowledge", "articles", "support_kb v2 · 5 chunks"],
        ]),
        prompt: "Reply to the customer in their language. Never promise refunds.\n\nTicket:\n$ticket\n\nQueue: $category\n\nAccount:\n$account\n\nArticles:\n$articles",
        slots: properties([
          ["$ticket", "← load_ticket.out"],
          ["$category", "← route_queue.out"],
          ["$account", "← lookup_account.out"],
          ["$articles", "knowledge · support_kb v2"],
        ]),
        outputType: "Reply\n{ subject: string, body: string }",
        source: `- id: draft_reply\n  kind: llm\n  agent: reply_writer\n  model: ${profileOf(node)}\n  prompt: draft_reply_v2\n  loop:\n    until: tone >= 0.85\n    max: 3\n  output: Reply`,
      }),
    },
    {
      id: "check_policy",
      look: (node) => ({ meta: familyMeta(node), io: ["in: Reply", "out: Verdict"] }),
      inspection: (node) => ({
        overview: modelOverview(node, "llm · judge"),
        config: properties([["temperature", "0 · agent"], ["max_tokens", "512"], ["reasoning", "off"], ["cost", NOT_RUN]]),
        inputs: inputs([["generated", "reply", "$draft_reply.out · Reply"], ["knowledge", "policy", "support_policy v5 · 6 chunks"]]),
        prompt: "Check the reply against the support policy.\n\nReply:\n$reply\n\nPolicy:\n$policy\n\nReturn { verdict, score, remark }.",
        slots: properties([["$reply", "← draft_reply.out"], ["$policy", "knowledge · support_policy v5"]]),
        outputType: VERDICT_OUTPUT_TYPE,
        source: `- id: check_policy\n  kind: llm\n  agent: policy_judge\n  model: ${profileOf(node)}\n  prompt: check_policy_v1\n  output: Verdict`,
      }),
    },
    {
      id: "approve_reply",
      look: () => ({ meta: "SLA 1 h · escalate", io: ["@support_lead", "out: Decision"] }),
      inspection: (node) => ({
        overview: properties([["kind", "human step"], ["name", node.id], stageRow(node), ["assignee", "@support_lead"], ["sla", "1 h · then escalate"], ["state", "not run yet"]]),
        config: properties([["form", "reply_review r1"], ["on timeout", "escalate to @support_head"], ["on reject", "reply dropped"], ["cost", "$0.0000"]]),
        inputs: inputs([["generated", "reply", "$draft_reply.out · Reply"], ["generated", "verdict", "$check_policy.out · Verdict"]]),
        prompt: "reply_review r1 — shown to the reviewer, not to a model",
        slots: properties([["$reply", "← draft_reply.out"], ["$verdict", "← check_policy.out"]]),
        outputType: "Decision\n{ decision: approve | changes | reject, note: string }",
        source: '- id: approve_reply\n  kind: human\n  assignee: "@support_lead"\n  form: reply_review\n  sla: 1h\n  on_timeout: escalate',
      }),
    },
  ],
}

const LINEAR_WORKFLOWS: readonly LinearWorkflow[] = [SEO_BRIEF_WRITER, REVIEW_SUMMARIZER, SUPPORT_TRIAGE]

const WORKFLOW_SCHEMAS: readonly { readonly workflow: string; readonly graph: SchemaGraph; readonly inspections: readonly NodeInspection[] }[] = [
  { workflow: WORKFLOWS.pitchPipeline, graph: pitchGraph, inspections: pitchInspections },
  ...LINEAR_WORKFLOWS.map((linear) => ({ workflow: linear.workflow, graph: linearGraph(linear), inspections: linearInspections(linear) })),
]

export const schemaGraphs: Readonly<Record<string, SchemaGraph>> = Object.fromEntries(
  WORKFLOW_SCHEMAS.map(({ workflow, graph }) => [workflowKey(workflow), graph]),
)

export const inspections: Readonly<Record<string, NodeInspection>> = Object.fromEntries(
  WORKFLOW_SCHEMAS.flatMap(({ workflow, inspections: nodes }) => nodes.map((node) => [workflowKey(workflow, node.id), node])),
)
