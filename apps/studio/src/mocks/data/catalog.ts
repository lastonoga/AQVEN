import type { ModelFamily, NodeId, NodeKind, StageId } from "@/domain"
import { nodeId, stageId } from "@/data/ids"
import { WORKFLOWS } from "./keys"

export type CatalogModel = { readonly family: ModelFamily; readonly model: string; readonly profile: string }

export type CatalogStage = { readonly id: StageId; readonly number: number; readonly title: string; readonly short: string }

export type CatalogNode = {
  readonly id: NodeId
  readonly kind: NodeKind
  readonly stage: number
  readonly role: string
  readonly model?: CatalogModel
}

export type WorkflowCatalog = { readonly stages: readonly CatalogStage[]; readonly nodes: readonly CatalogNode[] }

type StageRow = readonly [id: string, title: string, short: string]

type NodeRow = readonly [id: string, kind: NodeKind, stage: number, role: string, model?: CatalogModel]

const model = (family: ModelFamily, name: string, profile: string): CatalogModel => ({ family, model: name, profile })

const stagesOf = (rows: readonly StageRow[]): readonly CatalogStage[] =>
  rows.map(([id, title, short], index) => ({ id: stageId(id), number: index + 1, title, short }))

const nodesOf = (rows: readonly NodeRow[]): readonly CatalogNode[] =>
  rows.map(([id, kind, stage, role, spec]) => ({ id: nodeId(id), kind, stage, role, ...(spec === undefined ? {} : { model: spec }) }))

const PITCH_PIPELINE: WorkflowCatalog = {
  stages: stagesOf([
    ["data_load", "Data load", "load"],
    ["hotel_scoring", "Hotel scoring", "scoring ×10"],
    ["score_reduce", "Score reduce", "reduce"],
    ["pitch_divergence", "Pitch divergence", "divergence ×4"],
    ["critic_loop", "Critic loop", "critic loop"],
    ["asset_render", "Asset render", "assets ×3"],
    ["pitch_decision", "Pitch decision", "decision"],
  ]),
  nodes: nodesOf([
    ["load_hotels", "tool", 1, "data load"],
    ["score_hotel", "llm", 2, "scoring ×10", model("anthropic", "haiku-4.5", "scorer_fast")],
    ["rank_hotels", "fn", 3, "reduce"],
    ["pitch_gen_a", "llm", 4, "divergence", model("anthropic", "sonnet-4.5", "pitch_writer")],
    ["pitch_gen_b", "llm", 4, "divergence", model("openai", "gpt-5.1", "pitch_writer")],
    ["pitch_gen_c", "llm", 4, "divergence", model("google", "gemini-3-pro", "pitch_writer")],
    ["pitch_gen_d", "llm", 4, "divergence", model("mistral", "large-3", "pitch_writer")],
    ["judge_style", "llm", 5, "panel", model("anthropic", "opus-4.1", "judge_style")],
    ["judge_facts", "llm", 5, "panel quorum(2)", model("openai", "gpt-5.1-mini", "judge_grounding")],
    ["judge_tone", "llm", 5, "panel", model("google", "gemini-3-flash", "judge_tone")],
    ["fix_draft", "llm", 5, "critic loop", model("anthropic", "sonnet-4.5", "fix_writer")],
    ["render_hero", "image", 6, "asset render", model("openai", "gpt-image-2", "hero_renderer")],
    ["voice_pitch", "audio", 6, "asset render", model("anthropic", "tts-hd-3", "voice_reader")],
    ["cut_teaser", "video", 6, "asset render", model("google", "veo-3", "teaser_cutter")],
    ["publish_deck", "tool", 7, "after approve"],
    ["decide_pitch", "human", 7, "decision"],
    ["archive_draft", "fn", 7, "after reject"],
    ["persona_b2c", "llm", 7, "segments", model("anthropic", "sonnet-4.5", "persona_writer")],
    ["persona_b2b", "llm", 7, "segments", model("openai", "gpt-5.1", "persona_writer")],
    ["persona_mice", "llm", 7, "segments", model("google", "gemini-3-pro", "persona_writer")],
  ]),
}

const SEO_BRIEF_WRITER: WorkflowCatalog = {
  stages: stagesOf([
    ["serp_fetch", "SERP fetch", "fetch"],
    ["keyword_clusters", "Keyword clusters", "clusters"],
    ["brief_draft", "Brief draft", "draft"],
    ["brief_check", "Brief check", "check"],
  ]),
  nodes: nodesOf([
    ["fetch_serp", "tool", 1, "serp fetch"],
    ["cluster_keywords", "fn", 2, "clustering"],
    ["draft_brief", "llm", 3, "drafting", model("openai", "gpt-5.1", "brief_writer")],
    ["check_brief", "llm", 4, "review", model("anthropic", "haiku-4.5", "brief_judge")],
  ]),
}

const REVIEW_SUMMARIZER: WorkflowCatalog = {
  stages: stagesOf([
    ["review_load", "Review load", "load"],
    ["review_summaries", "Review summaries", "summaries ×20"],
    ["summary_merge", "Summary merge", "merge"],
  ]),
  nodes: nodesOf([
    ["load_reviews", "tool", 1, "review load"],
    ["summarize_review", "llm", 2, "map ×20", model("anthropic", "haiku-4.5", "summarizer_fast")],
    ["merge_summaries", "fn", 3, "reduce"],
  ]),
}

const SUPPORT_TRIAGE: WorkflowCatalog = {
  stages: stagesOf([
    ["ticket_intake", "Ticket intake", "intake"],
    ["ticket_classification", "Classification", "classify"],
    ["language_detection", "Language", "language"],
    ["queue_routing", "Queue routing", "route"],
    ["account_lookup", "Account lookup", "account"],
    ["reply_draft", "Reply draft", "draft"],
    ["policy_check", "Policy check", "policy"],
    ["reply_approval", "Approval", "approve"],
  ]),
  nodes: nodesOf([
    ["load_ticket", "tool", 1, "intake"],
    ["classify_ticket", "llm", 2, "classification", model("anthropic", "haiku-4.5", "triage_fast")],
    ["detect_language", "fn", 3, "language"],
    ["route_queue", "fn", 4, "routing"],
    ["lookup_account", "tool", 5, "account lookup"],
    ["draft_reply", "llm", 6, "reply draft", model("anthropic", "sonnet-4.5", "reply_writer")],
    ["check_policy", "llm", 7, "policy check", model("openai", "gpt-5.1-mini", "policy_judge")],
    ["approve_reply", "human", 8, "approval"],
  ]),
}

export const CATALOGS: Readonly<Record<string, WorkflowCatalog>> = Object.fromEntries([
  [WORKFLOWS.pitchPipeline, PITCH_PIPELINE],
  [WORKFLOWS.seoBriefWriter, SEO_BRIEF_WRITER],
  [WORKFLOWS.reviewSummarizer, REVIEW_SUMMARIZER],
  [WORKFLOWS.supportTriage, SUPPORT_TRIAGE],
])

const missing = (what: string): Error => new Error(`${what} is missing from the catalog`)

export const catalogOf = (workflow: string): WorkflowCatalog => {
  const found = CATALOGS[workflow]
  if (found === undefined) throw missing(`workflow ${workflow}`)
  return found
}

export const findCatalogNode = (workflow: string, id: string): CatalogNode | undefined =>
  catalogOf(workflow).nodes.find((node) => node.id === id)

export const catalogNode = (workflow: string, id: string): CatalogNode => {
  const found = findCatalogNode(workflow, id)
  if (found === undefined) throw missing(`node ${id} of ${workflow}`)
  return found
}

export const catalogStage = (workflow: string, id: string): CatalogStage => {
  const found = catalogOf(workflow).stages.find((stage) => stage.id === id)
  if (found === undefined) throw missing(`stage ${id} of ${workflow}`)
  return found
}

export const stageLabel = (node: CatalogNode): string => `${String(node.stage)} · ${node.role}`

const FAMILY_LABEL: Readonly<Record<ModelFamily, string>> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral",
}

export const familyLabel = (family: ModelFamily): string => FAMILY_LABEL[family]

export const pitchNode = (id: string): CatalogNode => catalogNode(WORKFLOWS.pitchPipeline, id)

export const pitchStage = (id: string): CatalogStage => catalogStage(WORKFLOWS.pitchPipeline, id)
