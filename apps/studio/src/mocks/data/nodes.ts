import type {
  Binding,
  BindingSource,
  CheckKind,
  NodeCheck,
  NodeContract,
  NodeSummary,
  NodesOverview,
  ProfileRef,
  RegistryEntry,
  RegistryKind,
  SignatureRef,
} from "@/domain"
import { registryEntryId, revisionId } from "@/data/ids"
import { catalogNode, type CatalogNode } from "./catalog"
import { WORKFLOWS, workflowKey } from "./keys"

type Usage = RegistryEntry["usage"]

type BindingSpec = {
  readonly input: string
  readonly type: string
  readonly optional?: boolean
  readonly source: BindingSource
  readonly resolver: string
  readonly lastRun: string
  readonly expression: string
}

type CheckSpec = NodeCheck & { readonly code: string }

type WriteSpec = { readonly channel: string; readonly reducer: string }

type ModelSpec = {
  readonly fallback: string
  readonly temperature: string
  readonly reasoning: string
  readonly maxTokens: number
  readonly retry: number
  readonly timeoutS: number
  readonly budget: string
}

type SignatureSpec = { readonly ref: SignatureRef; readonly clause: string }

type ProfileSpec = { readonly ref: ProfileRef; readonly lines: readonly string[] }

type ContractSpec = {
  readonly id: string
  readonly context: readonly string[]
  readonly head: readonly string[]
  readonly signature?: SignatureSpec
  readonly profile?: ProfileSpec
  readonly bindings: readonly BindingSpec[]
  readonly out: string
  readonly consumers: readonly string[]
  readonly writes: readonly WriteSpec[]
  readonly checks: readonly CheckSpec[]
}

const R42 = revisionId("r42")
const NO_RUN = "—"
const STRICT = "  // strict"

const summaryOf =
  (workflow: string) =>
  (id: string, path: readonly string[], signature?: SignatureRef): NodeSummary => {
    const node = catalogNode(workflow, id)
    const base = { id: node.id, kind: node.kind, stage: node.stage, path }
    if (signature === undefined) return base
    return { ...base, signature }
  }

const entry = (kind: RegistryKind, id: string, summaryText: string, usage: Usage, label: string = id): RegistryEntry => ({
  kind,
  id: registryEntryId(id),
  label,
  summary: summaryText,
  usage,
})

const nodes = (count: number): Usage => ({ count, unit: "node" })
const slots = (count: number): Usage => ({ count, unit: "slot" })

const check = (kind: CheckKind, code: string, rule: string, policy: string): CheckSpec => ({ kind, code, rule, policy })

const bind = (input: string, type: string, source: BindingSource, resolver: string, lastRun: string, expression: string): BindingSpec => ({
  input,
  type,
  source,
  resolver,
  lastRun,
  expression,
})

const optionalBind = (binding: BindingSpec): BindingSpec => ({ ...binding, optional: true })

const modelNameOf = (node: CatalogNode): string => node.model?.model ?? NO_RUN

const modelProfile = (node: CatalogNode, spec: ModelSpec): readonly string[] => [
  `provider: ${node.model?.family ?? NO_RUN} · model ${modelNameOf(node)}`,
  `fallback: ${spec.fallback}`,
  `t ${spec.temperature} · top_p 1.0 · reasoning ${spec.reasoning} · max ${String(spec.maxTokens)}`,
  `retry ${String(spec.retry)} · timeout ${String(spec.timeoutS)} s · budget ${spec.budget} / call`,
]

const inputDeclaration = (binding: BindingSpec): string => `${binding.input}${binding.optional === true ? "?" : ""}: ${binding.type}`

const signatureSource = (spec: ContractSpec, signature: SignatureSpec): string =>
  [
    `${signature.ref.id}:`,
    `  in:  ${spec.bindings.map(inputDeclaration).join(", ")}`,
    `  out: ${spec.out}${STRICT}`,
    `  ${signature.clause}`,
  ].join("\n")

const stateChannel = (write: WriteSpec): string => `$state.${write.channel}`

const consumedBy = (consumers: readonly string[]): string => {
  if (consumers.length === 0) return "end of workflow"
  return `consumed by ${consumers.join(", ")}`
}

const writesSource = (spec: ContractSpec): string => {
  const outLine = `out: ${spec.out} → ${consumedBy(spec.consumers)}`
  if (spec.writes.length === 0) return ["writes: none", outLine].join("\n")
  const width = Math.max(...spec.writes.map((write) => stateChannel(write).length))
  const lines = spec.writes.map((write) => `  ${stateChannel(write).padEnd(width)}  // reducer: ${write.reducer}`)
  return ["writes:", ...lines, outLine].join("\n")
}

const writesLine = (writes: readonly WriteSpec[]): readonly string[] => {
  if (writes.length === 0) return []
  return [`  writes: { ${writes.map((write) => `${write.channel}: ${write.reducer}`).join(", ")} }`]
}

const generatedSource = (spec: ContractSpec): string =>
  [
    `- id: ${spec.id}`,
    ...spec.head.map((line) => `  ${line}`),
    "  bind:",
    ...spec.bindings.map((binding) => `    ${binding.input}: ${binding.expression}`),
    ...writesLine(spec.writes),
    `  checks: [${spec.checks.map((item) => item.code).join(", ")}]`,
  ].join("\n")

const toBinding = ({ expression: _expression, optional = false, ...binding }: BindingSpec): Binding => ({
  ...binding,
  optional,
  resolved: true,
})

const toCheck = ({ code: _code, ...item }: CheckSpec): NodeCheck => item

const profileSpec = (node: CatalogNode, spec: ModelSpec): ProfileSpec => ({
  ref: { id: node.model?.profile ?? node.id, model: modelNameOf(node) },
  lines: modelProfile(node, spec),
})

const contractOf = (workflow: string) => (spec: ContractSpec): NodeContract => contract(catalogNode(workflow, spec.id), spec)

const contract = (node: CatalogNode, spec: ContractSpec): NodeContract => ({
  id: node.id,
  kind: node.kind,
  stage: node.stage,
  context: spec.context,
  signature: spec.signature === undefined ? null : { ref: spec.signature.ref, source: signatureSource(spec, spec.signature) },
  profile: spec.profile === undefined ? null : { ref: spec.profile.ref, source: spec.profile.lines.join("\n") },
  bindings: spec.bindings.map(toBinding),
  writesSource: writesSource(spec),
  checks: spec.checks.map(toCheck),
  generatedSource: generatedSource(spec),
})

const signatureHead = (signature: SignatureRef, profile: string): readonly string[] => [
  `signature: ${signature.id}@${signature.version}`,
  `profile: ${profile}`,
]

const PITCH_GEN_B = catalogNode(WORKFLOWS.pitchPipeline, "pitch_gen_b")

const pitchGenB: NodeContract = {
  id: PITCH_GEN_B.id,
  kind: PITCH_GEN_B.kind,
  stage: PITCH_GEN_B.stage,
  context: ["divergence branch b", "wrapped by diverge ×4"],
  signature: {
    ref: { id: "write_pitch", version: "v7", revision: R42 },
    source: `write_pitch:
  in:  persona: string, ranked: Ranked, facts: Facts,
       tone: Chunk[], brief_extra?: string,
       last_remarks: Verdict[]
  out: Pitch  // strict
  instructions: “write a hotel pitch, no invented numbers”`,
  },
  profile: {
    ref: { id: PITCH_GEN_B.model?.profile ?? "pitch_writer", model: modelNameOf(PITCH_GEN_B) },
    source: `provider: openai · model gpt-5.1 (2025-11-04)
fallback: gpt-5.1-mini · on 429 / truncated
t 0.9 · top_p 1.0 · reasoning medium · max 8192
retry 3 · timeout 60 s · budget $0.15 / call`,
  },
  bindings: [
    { input: "persona", type: "string", optional: false, source: "literal", resolver: "“family”", lastRun: '"family"', resolved: true },
    { input: "ranked", type: "Ranked", optional: false, source: "node_output", resolver: "rank_hotels.out · frozen per run", lastRun: "3 items · top 0.93", resolved: true },
    { input: "facts", type: "Facts", optional: false, source: "node_output", resolver: "load_hotels.out", lastRun: "beach_m 2100 · pool true", resolved: true },
    { input: "tone", type: "Chunk[]", optional: false, source: "knowledge", resolver: "brand_voice@v4 · pgvector · top-k 4 · rerank on", lastRun: "4 chunks · 812 tok", resolved: true },
    { input: "brief_extra", type: "string", optional: true, source: "human", resolver: "@lead · brief field · optional", lastRun: "“no superlatives, mention pool”", resolved: true },
    { input: "last_remarks", type: "Verdict[]", optional: false, source: "state", resolver: "$state.loop.remarks · reducer append · loop-scoped", lastRun: "2 remarks", resolved: true },
  ],
  writesSource: `writes:
  $state.drafts  // reducer: append
  $state.cost    // reducer: sum
out: Pitch → consumed by judge_facts, fix_draft`,
  checks: [
    { kind: "validator", rule: "schema · Pitch strict", policy: "fail → repair attempt" },
    { kind: "validator", rule: "hooks[*] non-empty", policy: "fail → row FAIL" },
    { kind: "scorer", rule: "judge_panel quorum(2) ≥ 0.90", policy: "below → loop again" },
    { kind: "scorer", rule: "facts grounded in $facts", policy: "below → needs_human" },
  ],
  generatedSource: `- id: pitch_gen_b
  signature: write_pitch@v7
  profile: pitch_writer
  bind:
    persona: "family"
    ranked: $node.rank_hotels.out
    facts: $node.load_hotels.out
    tone: $knowledge.pgvector(brand_voice@v4, top_k: 4, rerank: true)
    brief_extra: $human.brief_extra?
    last_remarks: $state.loop.remarks
  writes: { drafts: append, cost: sum }
  checks: [schema, hooks_non_empty, judge_panel@0.90, grounded]`,
}

type BranchSpec = {
  readonly branch: string
  readonly persona: string
  readonly fallback: string
  readonly lastRuns: readonly [ranked: string, remarks: string]
}

const pitchBranch = ({ branch, persona, fallback, lastRuns }: BranchSpec): NodeContract => {
  const [ranked, remarks] = lastRuns
  const node = catalogNode(WORKFLOWS.pitchPipeline, `pitch_gen_${branch}`)
  const id = node.id
  const overrides: Readonly<Record<string, Partial<Binding>>> = {
    persona: { resolver: `“${persona}”`, lastRun: `"${persona}"` },
    ranked: { lastRun: ranked },
    last_remarks: { lastRun: remarks },
  }
  return {
    ...pitchGenB,
    id,
    context: [`divergence branch ${branch}`, "wrapped by diverge ×4"],
    profile: {
      ref: { id: node.model?.profile ?? "pitch_writer", model: modelNameOf(node) },
      source: modelProfile(node, { fallback, temperature: "0.9", reasoning: "medium", maxTokens: 8192, retry: 3, timeoutS: 60, budget: "$0.15" }).join("\n"),
    },
    bindings: pitchGenB.bindings.map((binding) => ({ ...binding, ...overrides[binding.input] })),
    generatedSource: pitchGenB.generatedSource.replace("pitch_gen_b", id).replace('persona: "family"', `persona: "${persona}"`),
  }
}

type JudgeSpec = {
  readonly id: string
  readonly signature: SignatureRef
  readonly instruction: string
  readonly context: readonly string[]
  readonly head: readonly string[]
  readonly reference: readonly [input: string, type: string, source: BindingSource, resolver: string, lastRun: string, expression: string]
  readonly draftRun: string
  readonly rule: string
}

const judgeSpec = ({ id, signature, instruction, context, head, reference, draftRun, rule }: JudgeSpec): ContractSpec => {
  const node = catalogNode(WORKFLOWS.pitchPipeline, id)
  const profile = profileSpec(node, { fallback: "none", temperature: "0", reasoning: "off", maxTokens: 1024, retry: 2, timeoutS: 30, budget: "$0.01" })
  return {
    id,
    context,
    head: [...signatureHead(signature, profile.ref.id), ...head],
    signature: { ref: signature, clause: `instructions: “${instruction}”` },
    profile,
    bindings: [bind("draft", "Pitch", "node_output", "fix_draft.out · latest iteration", draftRun, "$node.fix_draft.out"), bind(...reference)],
    out: "Verdict",
    consumers: ["fix_draft", "decide_pitch"],
    writes: [{ channel: "loop.remarks", reducer: "append" }],
    checks: [check("validator", "schema", "schema · Verdict strict", "fail → repair attempt"), check("scorer", "panel@0.90", rule, "below → needs_human")],
  }
}

const pitchSpecs: readonly ContractSpec[] = [
  {
    id: "load_hotels",
    context: ["data load", "hotels.search · read"],
    head: ["adapter: hotels.search"],
    bindings: [
      bind("city", "string", "literal", "“Sochi”", '"Sochi"', '"Sochi"'),
      bind("nights", "number", "literal", "3", "3", "3"),
      optionalBind(bind("constraints", "string", "human", "@lead · brief field · optional", "“no nightclubs”", "$human.constraints?")),
    ],
    out: "Facts[]",
    consumers: ["score_hotel", "pitch_gen_b", "judge_facts"],
    writes: [],
    checks: [check("validator", "schema", "schema · Facts[] strict", "fail → retry 2"), check("validator", "min_items@3", "items ≥ 3", "fail → row FAIL")],
  },
  {
    id: "score_hotel",
    context: ["hotel scoring", "map ×10 · concurrency 8"],
    head: [...signatureHead({ id: "score_hotel", version: "v3" }, "scorer_fast"), "map: $node.load_hotels.out", "concurrency: 8"],
    signature: { ref: { id: "score_hotel", version: "v3" }, clause: "instructions: “score the hotel against the rubric, 0..1 with a reason”" },
    profile: profileSpec(catalogNode(WORKFLOWS.pitchPipeline, "score_hotel"), { fallback: "none", temperature: "0.2", reasoning: "off", maxTokens: 512, retry: 2, timeoutS: 20, budget: "$0.002" }),
    bindings: [
      bind("hotel", "Facts", "node_output", "load_hotels.out[i] · map item", "10 items · 10 / 10 ok", "$item"),
      bind("criteria", "string", "literal", "“rubric v3”", '"rubric v3"', '"rubric_v3"'),
    ],
    out: "Score",
    consumers: ["rank_hotels"],
    writes: [{ channel: "cost", reducer: "sum" }],
    checks: [check("validator", "schema", "schema · Score strict", "fail → repair attempt"), check("validator", "value_range", "value in 0..1", "fail → skip item")],
  },
  {
    id: "rank_hotels",
    context: ["score reduce", "reduce · pure function"],
    head: ["impl: rank_hotels"],
    bindings: [bind("scores", "Score[]", "node_output", "score_hotel[0…9].out · collected", "10 scores · max 0.93", "$node.score_hotel[*].out")],
    out: "Ranked",
    consumers: ["pitch_gen_a", "pitch_gen_b", "pitch_gen_c", "pitch_gen_d"],
    writes: [{ channel: "ranked", reducer: "replace" }],
    checks: [check("validator", "schema", "schema · Ranked strict", "fail → row FAIL"), check("validator", "cutoff@0.80", "cutoff 0.80 · top 3", "below → fewer items")],
  },
  judgeSpec({
    id: "judge_facts",
    signature: { id: "check_grounding", version: "v2" },
    instruction: "check every number and claim against the facts",
    context: ["judge panel quorum(2)", "map ×3 · one per claim"],
    head: ["map: claims($node.fix_draft.out)"],
    reference: ["facts", "Facts", "node_output", "load_hotels.out", "beach_m 2100 · pool true", "$node.load_hotels.out"],
    draftRun: "iteration 3 · 3 claims",
    rule: "claims grounded ≥ 0.90",
  }),
  judgeSpec({
    id: "judge_style",
    signature: { id: "check_style", version: "v2" },
    instruction: "check tone, banned words and sentence rhythm",
    context: ["judge panel quorum(2)", "one call per draft"],
    head: [],
    reference: ["bans", "Chunk[]", "knowledge", "brand_voice@v4 · bans", "4 bans · 96 tok", "$knowledge.pgvector(brand_voice@v4, filter: bans)"],
    draftRun: "iteration 3 · 412 chars",
    rule: "tone, bans, rhythm ≥ 0.90",
  }),
  judgeSpec({
    id: "judge_tone",
    signature: { id: "check_tone", version: "v2" },
    instruction: "compare the voice of the draft with the brand voice",
    context: ["judge panel quorum(2)", "one call per draft"],
    head: [],
    reference: ["tone", "Chunk[]", "knowledge", "brand_voice@v4 · pgvector · top-k 4", "4 chunks · 812 tok", "$knowledge.pgvector(brand_voice@v4, top_k: 4)"],
    draftRun: "iteration 3 · 412 chars",
    rule: "brand voice v4 ≥ 0.90",
  }),
  {
    id: "fix_draft",
    context: ["critic loop", "loop body · max 8"],
    head: [...signatureHead({ id: "apply_remarks", version: "v4" }, "fix_writer"), "loop: { until: judge_panel@0.90, max: 8, budget: $0.50 }"],
    signature: { ref: { id: "apply_remarks", version: "v4" }, clause: "instructions: “change only what the remarks demand”" },
    profile: profileSpec(catalogNode(WORKFLOWS.pitchPipeline, "fix_draft"), { fallback: "haiku-4.5", temperature: "0.6", reasoning: "medium", maxTokens: 4096, retry: 3, timeoutS: 60, budget: "$0.50" }),
    bindings: [
      bind("draft", "Pitch", "state", "$state.loop.best · previous iteration · loop-scoped", "iteration 3 · score 0.86", "$state.loop.best"),
      bind("verdicts", "Verdict[]", "node_output", "judge_panel.out · quorum(2)", "3 verdicts · 1 needs_human", "$node.judge_panel.out"),
    ],
    out: "Pitch",
    consumers: ["judge_facts", "decide_pitch"],
    writes: [
      { channel: "drafts", reducer: "append" },
      { channel: "cost", reducer: "sum" },
    ],
    checks: [
      check("validator", "schema", "schema · Pitch strict", "fail → repair attempt"),
      check("scorer", "judge_panel@0.90", "judge_panel quorum(2) ≥ 0.90", "below → loop again"),
      check("validator", "stagnation@0.01", "stagnation Δ < 0.01", "hit → stop loop"),
    ],
  },
  {
    id: "decide_pitch",
    context: ["decision", "SLA 4 h · escalate to @head"],
    head: [...signatureHead({ id: "review_pitch", version: "v3" }, "human_lead"), "sla: 4h", "on_timeout: escalate"],
    signature: { ref: { id: "review_pitch", version: "v3" }, clause: "form: approve | changes | reject + note" },
    profile: {
      ref: { id: "human_lead", model: "@lead" },
      lines: ["assignee: @lead · no model", "sla: 4 h · then escalate to @head", "on timeout: escalate · on reject: branch dropped", "budget $0.00 / decision"],
    },
    bindings: [
      bind("best_pitch", "Pitch", "node_output", "critic_loop.best · selected iteration", "iteration 3 · score 0.91", "$node.critic_loop.best"),
      bind("verdicts", "Verdict[]", "node_output", "judge_panel.out", "3 verdicts · needs_human", "$node.judge_panel.out"),
    ],
    out: "Decision",
    consumers: ["publish_deck", "archive_draft"],
    writes: [{ channel: "decision", reducer: "replace" }],
    checks: [check("validator", "schema", "schema · Decision strict", "fail → ask again"), check("validator", "note_on_reject", "note required on reject", "fail → block submit")],
  },
  {
    id: "publish_deck",
    context: ["after approve", "deck.publish · write"],
    head: ["adapter: deck.publish", "when: $node.decide_pitch.out == approve", "timeout: 30s"],
    bindings: [bind("pitch", "Pitch", "node_output", "critic_loop.best · after approve", "not called · waiting on human", "$node.critic_loop.best")],
    out: "none",
    consumers: [],
    writes: [{ channel: "published", reducer: "replace" }],
    checks: [check("validator", "adapter_ok", "adapter response 2xx", "fail → retry 2")],
  },
  {
    id: "archive_draft",
    context: ["after reject", "archive_draft() · pure"],
    head: ["impl: archive_draft", "when: $node.decide_pitch.out == reject"],
    bindings: [bind("pitch", "Pitch", "node_output", "critic_loop.best · after reject", "not called", "$node.critic_loop.best")],
    out: "none",
    consumers: [],
    writes: [{ channel: "archive", reducer: "append" }],
    checks: [check("validator", "schema", "schema · Pitch strict", "fail → skip archive")],
  },
]

const pitchContracts: readonly NodeContract[] = [
  ...pitchSpecs.map(contractOf(WORKFLOWS.pitchPipeline)),
  pitchGenB,
  pitchBranch({ branch: "a", persona: "premium", fallback: "haiku-4.5", lastRuns: ["3 items · top 0.91", "1 remark"] }),
  pitchBranch({ branch: "c", persona: "budget", fallback: "gemini-3-flash", lastRuns: ["3 items · top 0.88", "3 remarks"] }),
  pitchBranch({ branch: "d", persona: "business", fallback: "none", lastRuns: ["3 items · top 0.90", "2 remarks"] }),
]

const pitchSummary = summaryOf(WORKFLOWS.pitchPipeline)

const pitchOverview: NodesOverview = {
  revision: { id: R42, status: "draft" },
  nodes: [
    pitchSummary("load_hotels", []),
    pitchSummary("score_hotel", ["map ×10"], { id: "score_hotel", version: "v3" }),
    pitchSummary("rank_hotels", ["reduce"]),
    pitchSummary("pitch_gen_b", ["branch b"], { id: "write_pitch", version: "v7" }),
    pitchSummary("judge_facts", ["panel", "map ×3"], { id: "check_grounding", version: "v2" }),
    pitchSummary("fix_draft", ["loop body"], { id: "apply_remarks", version: "v4" }),
    pitchSummary("decide_pitch", [], { id: "review_pitch", version: "v3" }),
  ],
  registry: {
    signature: [
      entry("signature", "write_pitch", "v7 · r42 · 6 in → Pitch", nodes(4)),
      entry("signature", "score_hotel", "v3 · 2 in → Score", nodes(1)),
      entry("signature", "check_grounding", "v2 · 2 in → Verdict", nodes(1)),
      entry("signature", "check_style", "v2 · 2 in → Verdict", nodes(1)),
      entry("signature", "check_tone", "v2 · 2 in → Verdict", nodes(1)),
      entry("signature", "apply_remarks", "v4 · 2 in → Pitch", nodes(1)),
      entry("signature", "review_pitch", "v3 · human form → Decision", nodes(1)),
    ],
    profile: [
      entry("profile", "pitch_writer", "per-branch model · t 0.9", nodes(4)),
      entry("profile", "scorer_fast", "haiku-4.5 · t 0.2", nodes(1)),
      entry("profile", "judge_grounding", "gpt-5.1-mini · t 0", nodes(1)),
      entry("profile", "judge_style", "opus-4.1 · t 0", nodes(1)),
      entry("profile", "judge_tone", "gemini-3-flash · t 0", nodes(1)),
      entry("profile", "fix_writer", "sonnet-4.5 → haiku · t 0.6", nodes(1)),
      entry("profile", "human_lead", "no model · SLA 4 h", nodes(1), "human · @lead"),
    ],
    adapter: [
      entry("adapter", "brand_voice", "built-in · top-k, rerank, ttl 15 m", slots(6), "pgvector · brand_voice"),
      entry("adapter", "hotels.search", "custom · GET /hotels · key in env", slots(3), "rest · hotels.search"),
      entry("adapter", "deck.publish", "custom · POST /decks · service account", slots(1), "rest · deck.publish"),
      entry("adapter", "state", "built-in · channels + reducers", slots(5)),
      entry("adapter", "human", "built-in · form field + SLA", slots(2)),
    ],
    type: [
      entry("type", "Pitch", "v3 · 3 fields", nodes(5)),
      entry("type", "Verdict", "v2 · enum + score", nodes(3)),
      entry("type", "Facts", "v2 · 7 fields", nodes(2)),
      entry("type", "Ranked", "v1 · items + cutoff", nodes(2)),
      entry("type", "Score", "v1 · value + why", nodes(1)),
      entry("type", "Decision", "v1 · enum + note", nodes(1)),
    ],
  },
}

const seoSpecs: readonly ContractSpec[] = [
  {
    id: "fetch_serp",
    context: ["serp fetch", "serp.search · read"],
    head: ["adapter: serp.search"],
    bindings: [
      bind("topic", "string", "literal", "“family hotels sochi”", '"family hotels sochi"', '"family hotels sochi"'),
      bind("locale", "string", "literal", "“ru-RU”", '"ru-RU"', '"ru-RU"'),
    ],
    out: "Keyword[]",
    consumers: ["cluster_keywords"],
    writes: [{ channel: "serp", reducer: "replace" }],
    checks: [check("validator", "schema", "schema · Keyword[] strict", "fail → retry 2"), check("validator", "min_items@10", "items ≥ 10", "fail → row FAIL")],
  },
  {
    id: "cluster_keywords",
    context: ["clustering", "reduce · pure function"],
    head: ["impl: cluster_keywords"],
    bindings: [bind("keywords", "Keyword[]", "node_output", "fetch_serp.out", "24 keywords", "$node.fetch_serp.out")],
    out: "Keyword[]",
    consumers: ["draft_brief"],
    writes: [],
    checks: [check("validator", "max_clusters@8", "clusters ≤ 8", "fail → merge smallest")],
  },
  {
    id: "draft_brief",
    context: ["drafting"],
    head: signatureHead({ id: "write_brief", version: "v2" }, "brief_writer"),
    signature: { ref: { id: "write_brief", version: "v2" }, clause: "instructions: “write an SEO brief grounded in the clusters”" },
    profile: profileSpec(catalogNode(WORKFLOWS.seoBriefWriter, "draft_brief"), { fallback: "gpt-5.1-mini", temperature: "0.7", reasoning: "low", maxTokens: 4096, retry: 3, timeoutS: 60, budget: "$0.10" }),
    bindings: [
      bind("topic", "string", "literal", "“family hotels sochi”", '"family hotels sochi"', '"family hotels sochi"'),
      bind("clusters", "Keyword[]", "node_output", "cluster_keywords.out", "6 clusters", "$node.cluster_keywords.out"),
      optionalBind(bind("audience", "string", "human", "@editor · brief field · optional", "“parents with kids”", "$human.audience?")),
    ],
    out: "Brief",
    consumers: ["check_brief"],
    writes: [
      { channel: "drafts", reducer: "append" },
      { channel: "cost", reducer: "sum" },
    ],
    checks: [check("validator", "schema", "schema · Brief strict", "fail → repair attempt"), check("scorer", "check_brief@0.85", "check_brief ≥ 0.85", "below → redraft")],
  },
  {
    id: "check_brief",
    context: ["review", "one judge call"],
    head: signatureHead({ id: "check_brief", version: "v1" }, "brief_judge"),
    signature: { ref: { id: "check_brief", version: "v1" }, clause: "instructions: “check coverage of every cluster and flag keyword stuffing”" },
    profile: profileSpec(catalogNode(WORKFLOWS.seoBriefWriter, "check_brief"), { fallback: "none", temperature: "0", reasoning: "off", maxTokens: 1024, retry: 2, timeoutS: 30, budget: "$0.03" }),
    bindings: [
      bind("brief", "Brief", "node_output", "draft_brief.out", "1 brief · 1,240 words", "$node.draft_brief.out"),
      bind("clusters", "Keyword[]", "node_output", "cluster_keywords.out", "6 clusters", "$node.cluster_keywords.out"),
    ],
    out: "Verdict",
    consumers: [],
    writes: [],
    checks: [check("validator", "schema", "schema · Verdict strict", "fail → repair attempt")],
  },
]

const seoSummary = summaryOf(WORKFLOWS.seoBriefWriter)

const seoOverview: NodesOverview = {
  revision: { id: revisionId("r9"), status: "applied" },
  nodes: [
    seoSummary("fetch_serp", []),
    seoSummary("cluster_keywords", ["reduce"]),
    seoSummary("draft_brief", [], { id: "write_brief", version: "v2" }),
    seoSummary("check_brief", ["judge"], { id: "check_brief", version: "v1" }),
  ],
  registry: {
    signature: [entry("signature", "write_brief", "v2 · 3 in → Brief", nodes(1)), entry("signature", "check_brief", "v1 · 2 in → Verdict", nodes(1))],
    profile: [entry("profile", "brief_writer", "gpt-5.1 → mini · t 0.7", nodes(1)), entry("profile", "brief_judge", "haiku-4.5 · t 0", nodes(1))],
    adapter: [
      entry("adapter", "serp.search", "custom · GET /search · key in env", slots(1), "rest · serp.search"),
      entry("adapter", "state", "built-in · channels + reducers", slots(2)),
      entry("adapter", "human", "built-in · form field + SLA", slots(1)),
    ],
    type: [
      entry("type", "Brief", "v2 · 6 fields", nodes(2)),
      entry("type", "Keyword", "v1 · term + volume", nodes(4)),
      entry("type", "Verdict", "v2 · enum + score", nodes(1)),
    ],
  },
}

const reviewSpecs: readonly ContractSpec[] = [
  {
    id: "load_reviews",
    context: ["review load", "reviews.fetch · read"],
    head: ["adapter: reviews.fetch"],
    bindings: [
      bind("hotel_id", "string", "literal", "“riviera_sochi”", '"riviera_sochi"', '"riviera_sochi"'),
      bind("limit", "number", "literal", "20", "20", "20"),
    ],
    out: "Review[]",
    consumers: ["summarize_review"],
    writes: [],
    checks: [check("validator", "schema", "schema · Review[] strict", "fail → retry 2")],
  },
  {
    id: "summarize_review",
    context: ["summaries", "map ×20 · concurrency 10"],
    head: [...signatureHead({ id: "summarize_review", version: "v3" }, "summarizer_fast"), "map: $node.load_reviews.out", "concurrency: 10"],
    signature: { ref: { id: "summarize_review", version: "v3" }, clause: "instructions: “summarize in one sentence and label the sentiment”" },
    profile: profileSpec(catalogNode(WORKFLOWS.reviewSummarizer, "summarize_review"), { fallback: "none", temperature: "0.3", reasoning: "off", maxTokens: 256, retry: 2, timeoutS: 20, budget: "$0.005" }),
    bindings: [
      bind("review", "Review", "node_output", "load_reviews.out[i] · map item", "20 items · 20 / 20 ok", "$item"),
      bind("style", "Chunk[]", "knowledge", "brand_voice@v4 · pgvector · top-k 2", "2 chunks · 240 tok", "$knowledge.pgvector(brand_voice@v4, top_k: 2)"),
    ],
    out: "Summary",
    consumers: ["merge_summaries"],
    writes: [{ channel: "cost", reducer: "sum" }],
    checks: [check("validator", "schema", "schema · Summary strict", "fail → repair attempt")],
  },
  {
    id: "merge_summaries",
    context: ["merge", "reduce · pure function"],
    head: ["impl: merge_summaries"],
    bindings: [bind("summaries", "Summary[]", "node_output", "summarize_review[0…19].out · collected", "20 summaries · 16 positive", "$node.summarize_review[*].out")],
    out: "Summary",
    consumers: [],
    writes: [{ channel: "digest", reducer: "replace" }],
    checks: [check("validator", "schema", "schema · Summary strict", "fail → row FAIL")],
  },
]

const reviewSummary = summaryOf(WORKFLOWS.reviewSummarizer)

const reviewOverview: NodesOverview = {
  revision: { id: revisionId("r14"), status: "applied" },
  nodes: [
    reviewSummary("load_reviews", []),
    reviewSummary("summarize_review", ["map ×20"], { id: "summarize_review", version: "v3" }),
    reviewSummary("merge_summaries", ["reduce"]),
  ],
  registry: {
    signature: [entry("signature", "summarize_review", "v3 · 2 in → Summary", nodes(1))],
    profile: [entry("profile", "summarizer_fast", "haiku-4.5 · t 0.3", nodes(1))],
    adapter: [
      entry("adapter", "reviews.fetch", "custom · GET /reviews · key in env", slots(1), "rest · reviews.fetch"),
      entry("adapter", "brand_voice", "built-in · top-k, rerank, ttl 15 m", slots(1), "pgvector · brand_voice"),
      entry("adapter", "state", "built-in · channels + reducers", slots(2)),
    ],
    type: [entry("type", "Review", "v1 · 5 fields", nodes(2)), entry("type", "Summary", "v2 · text + sentiment", nodes(2))],
  },
}

const triageModel = (id: string, spec: ModelSpec): ProfileSpec => profileSpec(catalogNode(WORKFLOWS.supportTriage, id), spec)

const triageSpecs: readonly ContractSpec[] = [
  {
    id: "load_ticket",
    context: ["intake", "helpdesk.read · read"],
    head: ["adapter: helpdesk.read"],
    bindings: [bind("ticket_id", "string", "human", "@support · ticket field", NO_RUN, "$human.ticket_id")],
    out: "Ticket",
    consumers: ["classify_ticket", "detect_language", "lookup_account", "draft_reply"],
    writes: [],
    checks: [check("validator", "schema", "schema · Ticket strict", "fail → retry 2")],
  },
  {
    id: "classify_ticket",
    context: ["classification"],
    head: signatureHead({ id: "classify_ticket", version: "v4" }, "triage_fast"),
    signature: { ref: { id: "classify_ticket", version: "v4" }, clause: "instructions: “pick one category and a confidence”" },
    profile: triageModel("classify_ticket", { fallback: "none", temperature: "0", reasoning: "off", maxTokens: 256, retry: 2, timeoutS: 15, budget: "$0.001" }),
    bindings: [
      bind("ticket", "Ticket", "node_output", "load_ticket.out", NO_RUN, "$node.load_ticket.out"),
      bind("taxonomy", "string", "literal", "“support taxonomy v6”", NO_RUN, '"taxonomy_v6"'),
    ],
    out: "Category",
    consumers: ["route_queue"],
    writes: [{ channel: "cost", reducer: "sum" }],
    checks: [check("validator", "schema", "schema · Category strict", "fail → repair attempt"), check("scorer", "confidence@0.70", "confidence ≥ 0.70", "below → needs_human")],
  },
  {
    id: "detect_language",
    context: ["language", "pure function"],
    head: ["impl: detect_language"],
    bindings: [bind("ticket", "Ticket", "node_output", "load_ticket.out", NO_RUN, "$node.load_ticket.out")],
    out: "Locale",
    consumers: ["draft_reply"],
    writes: [{ channel: "locale", reducer: "replace" }],
    checks: [check("validator", "confidence@0.60", "confidence ≥ 0.60", "below → default locale")],
  },
  {
    id: "route_queue",
    context: ["routing", "switch · pure function"],
    head: ["impl: route_queue"],
    bindings: [bind("category", "Category", "node_output", "classify_ticket.out", NO_RUN, "$node.classify_ticket.out")],
    out: "Category",
    consumers: ["draft_reply"],
    writes: [{ channel: "queue", reducer: "replace" }],
    checks: [check("validator", "known_queue", "queue exists", "fail → default queue")],
  },
  {
    id: "lookup_account",
    context: ["account lookup", "crm.lookup · read"],
    head: ["adapter: crm.lookup"],
    bindings: [bind("email", "string", "node_output", "load_ticket.out.customer_email", NO_RUN, "$node.load_ticket.out.customer_email")],
    out: "Account",
    consumers: ["draft_reply"],
    writes: [],
    checks: [check("validator", "schema", "schema · Account strict", "fail → retry 2")],
  },
  {
    id: "draft_reply",
    context: ["reply draft", "loop body · max 3"],
    head: [...signatureHead({ id: "draft_reply", version: "v2" }, "reply_writer"), "loop: { until: tone@0.85, max: 3 }"],
    signature: { ref: { id: "draft_reply", version: "v2" }, clause: "instructions: “answer with the knowledge base, never promise refunds”" },
    profile: triageModel("draft_reply", { fallback: "haiku-4.5", temperature: "0.6", reasoning: "low", maxTokens: 2048, retry: 3, timeoutS: 45, budget: "$0.04" }),
    bindings: [
      bind("ticket", "Ticket", "node_output", "load_ticket.out", NO_RUN, "$node.load_ticket.out"),
      bind("category", "Category", "node_output", "route_queue.out", NO_RUN, "$node.route_queue.out"),
      bind("account", "Account", "node_output", "lookup_account.out", NO_RUN, "$node.lookup_account.out"),
      bind("articles", "Chunk[]", "knowledge", "support_kb@v2 · pgvector · top-k 5 · rerank on", NO_RUN, "$knowledge.pgvector(support_kb@v2, top_k: 5, rerank: true)"),
    ],
    out: "Reply",
    consumers: ["check_policy", "approve_reply"],
    writes: [
      { channel: "drafts", reducer: "append" },
      { channel: "cost", reducer: "sum" },
    ],
    checks: [check("validator", "schema", "schema · Reply strict", "fail → repair attempt"), check("scorer", "tone@0.85", "tone ≥ 0.85", "below → loop again")],
  },
  {
    id: "check_policy",
    context: ["policy check", "one judge call"],
    head: signatureHead({ id: "check_policy", version: "v1" }, "policy_judge"),
    signature: { ref: { id: "check_policy", version: "v1" }, clause: "instructions: “check the reply against the support policy”" },
    profile: triageModel("check_policy", { fallback: "none", temperature: "0", reasoning: "off", maxTokens: 512, retry: 2, timeoutS: 20, budget: "$0.005" }),
    bindings: [
      bind("reply", "Reply", "node_output", "draft_reply.out", NO_RUN, "$node.draft_reply.out"),
      bind("policy", "Chunk[]", "knowledge", "support_policy@v5 · pgvector · top-k 6", NO_RUN, "$knowledge.pgvector(support_policy@v5, top_k: 6)"),
    ],
    out: "Verdict",
    consumers: ["approve_reply"],
    writes: [],
    checks: [check("validator", "schema", "schema · Verdict strict", "fail → repair attempt"), check("scorer", "policy@0.90", "policy ≥ 0.90", "below → needs_human")],
  },
  {
    id: "approve_reply",
    context: ["approval", "SLA 1 h · escalate to @support_head"],
    head: [...signatureHead({ id: "approve_reply", version: "v1" }, "human_support_lead"), "sla: 1h", "on_timeout: escalate"],
    signature: { ref: { id: "approve_reply", version: "v1" }, clause: "form: approve | changes | reject + note" },
    profile: {
      ref: { id: "human_support_lead", model: "@support_lead" },
      lines: ["assignee: @support_lead · no model", "sla: 1 h · then escalate to @support_head", "on timeout: escalate · on reject: reply dropped", "budget $0.00 / decision"],
    },
    bindings: [bind("reply", "Reply", "node_output", "draft_reply.out · last iteration", NO_RUN, "$node.draft_reply.out")],
    out: "Decision",
    consumers: [],
    writes: [{ channel: "decision", reducer: "replace" }],
    checks: [check("validator", "schema", "schema · Decision strict", "fail → ask again")],
  },
]

const triageSummary = summaryOf(WORKFLOWS.supportTriage)

const triageOverview: NodesOverview = {
  revision: { id: revisionId("r3"), status: "draft" },
  nodes: [
    triageSummary("load_ticket", []),
    triageSummary("classify_ticket", [], { id: "classify_ticket", version: "v4" }),
    triageSummary("detect_language", []),
    triageSummary("route_queue", ["switch"]),
    triageSummary("lookup_account", []),
    triageSummary("draft_reply", ["loop body"], { id: "draft_reply", version: "v2" }),
    triageSummary("check_policy", ["judge"], { id: "check_policy", version: "v1" }),
    triageSummary("approve_reply", [], { id: "approve_reply", version: "v1" }),
  ],
  registry: {
    signature: [
      entry("signature", "classify_ticket", "v4 · 2 in → Category", nodes(1)),
      entry("signature", "draft_reply", "v2 · 4 in → Reply", nodes(1)),
      entry("signature", "check_policy", "v1 · 2 in → Verdict", nodes(1)),
      entry("signature", "approve_reply", "v1 · human form → Decision", nodes(1)),
    ],
    profile: [
      entry("profile", "triage_fast", "haiku-4.5 · t 0", nodes(1)),
      entry("profile", "reply_writer", "sonnet-4.5 → haiku · t 0.6", nodes(1)),
      entry("profile", "policy_judge", "gpt-5.1-mini · t 0", nodes(1)),
      entry("profile", "human_support_lead", "no model · SLA 1 h", nodes(1), "human · @support_lead"),
    ],
    adapter: [
      entry("adapter", "helpdesk.read", "custom · GET /tickets/:id · key in env", slots(1), "rest · helpdesk.read"),
      entry("adapter", "crm.lookup", "custom · GET /accounts · key in env", slots(1), "rest · crm.lookup"),
      entry("adapter", "support_kb", "built-in · top-k, rerank", slots(2), "pgvector · support_kb"),
      entry("adapter", "state", "built-in · channels + reducers", slots(6)),
      entry("adapter", "human", "built-in · form field + SLA", slots(2)),
    ],
    type: [
      entry("type", "Ticket", "v2 · 8 fields", nodes(5)),
      entry("type", "Category", "v1 · enum + confidence", nodes(3)),
      entry("type", "Locale", "v1 · code + confidence", nodes(1)),
      entry("type", "Account", "v1 · 4 fields", nodes(2)),
      entry("type", "Reply", "v1 · body + macros", nodes(3)),
      entry("type", "Verdict", "v2 · enum + score", nodes(1)),
      entry("type", "Decision", "v1 · enum + note", nodes(1)),
    ],
  },
}

type WorkflowNodes = { readonly workflow: string; readonly overview: NodesOverview; readonly contracts: readonly NodeContract[] }

const WORKFLOW_NODES: readonly WorkflowNodes[] = [
  { workflow: WORKFLOWS.pitchPipeline, overview: pitchOverview, contracts: pitchContracts },
  { workflow: WORKFLOWS.seoBriefWriter, overview: seoOverview, contracts: seoSpecs.map(contractOf(WORKFLOWS.seoBriefWriter)) },
  { workflow: WORKFLOWS.reviewSummarizer, overview: reviewOverview, contracts: reviewSpecs.map(contractOf(WORKFLOWS.reviewSummarizer)) },
  { workflow: WORKFLOWS.supportTriage, overview: triageOverview, contracts: triageSpecs.map(contractOf(WORKFLOWS.supportTriage)) },
]

export const nodesOverviews: Readonly<Record<string, NodesOverview>> = Object.fromEntries(
  WORKFLOW_NODES.map(({ workflow, overview }) => [workflowKey(workflow), overview]),
)

export const contracts: Readonly<Record<string, NodeContract>> = Object.fromEntries(
  WORKFLOW_NODES.flatMap(({ workflow, contracts: list }) => list.map((item) => [workflowKey(workflow, item.id), item])),
)
