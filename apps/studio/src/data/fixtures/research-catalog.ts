import type {
  AgentRef,
  ArmStep,
  CaseTags,
  DatasetId,
  ExperimentArm,
  ExperimentCheck,
  ExperimentDetail,
  ExperimentVariant,
  FlowId,
  NodeKind,
  VariantAssignment,
  VariantRole,
} from "@/domain"
import * as ids from "@/data/ids"
import { EXPERIMENT_NOTES } from "./research-notes"

export type VariantModel = {
  readonly checks: Readonly<Record<string, number>>
  readonly scores: Readonly<Record<string, number>>
  readonly usd: number
  readonly latencyMs: number
  readonly schemaValid: number
  readonly infraError: number
}

export type DatasetCaseFixture = { readonly name: string; readonly tags: CaseTags }

export type DatasetFixture = { readonly id: DatasetId; readonly flow: FlowId | null; readonly cases: readonly DatasetCaseFixture[] }

export type ExperimentFixture = Omit<ExperimentDetail, "latest" | "seriesCount" | "spentUsd" | "cases" | "metrics" | "notes" | "files"> & {
  readonly dataset: DatasetId
  readonly tags: CaseTags
  readonly spread: number
  readonly models: Readonly<Record<string, VariantModel>>
}

const AGENT_MODELS = {
  deepseek: "openrouter:deepseek/deepseek-v4-flash-0731",
  gemini: "openrouter:google/gemini-2.5-flash-lite",
  gpt: "openrouter:openai/gpt-oss-20b",
  llama: "openrouter:meta-llama/llama-3.1-8b-instruct",
  mistral: "openrouter:mistralai/mistral-nemo",
  qwen: "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
} as const

type AgentName = keyof typeof AGENT_MODELS

const agent = (name: AgentName): AgentRef => ({ id: ids.agentId(name), model: AGENT_MODELS[name] })

const step = (node: string, kind: NodeKind, name: AgentName | null, description: string): ArmStep => ({
  node: ids.nodeId(node),
  kind,
  agent: name === null ? null : agent(name),
  description,
})

const assign = (node: string, name: AgentName, overridden = false): VariantAssignment => ({ node: ids.nodeId(node), agent: agent(name), overridden })

const variant = (id: string, role: VariantRole, arm: string | null, assignments: readonly VariantAssignment[]): ExperimentVariant => ({
  id: ids.variantId(id),
  arm: arm === null ? null : ids.armId(arm),
  role,
  assignments,
})

const arm = (id: string, description: string, steps: readonly ArmStep[]): ExperimentArm => ({ id: ids.armId(id), description, steps })

const expected = (id: string, fields: readonly string[]): ExperimentCheck => ({
  id: ids.checkId(id),
  kind: "binary",
  source: { kind: "builtin", use: "expected", fields },
})

const PROMISES: ExperimentCheck = {
  id: ids.checkId("promises"),
  kind: "binary",
  source: { kind: "code", ref: "@root.code.support_case:promises_match_resolution" },
}

const CRITIQUE: ExperimentCheck = {
  id: ids.checkId("critique"),
  kind: "continuous",
  source: { kind: "judge", inference: "critique", agent: agent("deepseek"), validatedBy: ids.experimentId("critique_planted_defects") },
}

const model = (fields: Partial<VariantModel> & Pick<VariantModel, "usd" | "latencyMs">): VariantModel => ({
  checks: {},
  scores: {},
  schemaValid: 0.96,
  infraError: 0.01,
  ...fields,
})

const SUPPORT_CASES: readonly DatasetCaseFixture[] = [
  { name: "strip_flicker_credit", tags: { lamp_kind: "smart_wifi", channel: "amazon", action: "store_credit", length: "long", regression: "no" } },
  { name: "bulb_app_offline_advice", tags: { lamp_kind: "smart_wifi", channel: "storefront", action: "advice", length: "short", regression: "yes" } },
  { name: "lamp_crushed_box_reship", tags: { lamp_kind: "mains", channel: "ozon", action: "reship", length: "short", regression: "yes" } },
  { name: "nova_runtime_advice", tags: { lamp_kind: "rechargeable", channel: "storefront", action: "advice", length: "short", regression: "yes" } },
  { name: "nova_no_charge_replacement", tags: { lamp_kind: "rechargeable", channel: "amazon", action: "replacement", length: "long", regression: "no" } },
  { name: "zigbee_pairing_advice", tags: { lamp_kind: "smart_zigbee", channel: "storefront", action: "advice", length: "short", regression: "no" } },
  { name: "strip_dead_segment_replacement", tags: { lamp_kind: "smart_wifi", channel: "storefront", action: "replacement", length: "long", regression: "no" } },
  { name: "dimmer_buzz_advice", tags: { lamp_kind: "mains", channel: "ozon", action: "advice", length: "long", regression: "yes" } },
  { name: "hub_missing_mount_reship", tags: { lamp_kind: "none", channel: "amazon", action: "reship", length: "short", regression: "no" } },
  { name: "candle_flicker_credit", tags: { lamp_kind: "smart_zigbee", channel: "storefront", action: "store_credit", length: "long", regression: "yes" } },
  { name: "arc_floor_burning_smell_replacement", tags: { lamp_kind: "mains", channel: "storefront", action: "replacement", length: "long", regression: "no" } },
  { name: "nova_gift_warranty_question", tags: { lamp_kind: "rechargeable", channel: "storefront", action: "advice", length: "short", regression: "no" } },
]

const LONG_MESSAGES: readonly DatasetCaseFixture[] = [
  { name: "strip_late_parcel_then_flicker", tags: { length: "long", intent: "defect", opens_with: "delivery" } },
  { name: "nova_gift_story_no_charge", tags: { length: "long", intent: "defect", opens_with: "question" } },
  { name: "arc_desk_moving_house_switch_dead", tags: { length: "long", intent: "defect", opens_with: "other" } },
  { name: "glow_app_history_flicker", tags: { length: "very_long", intent: "defect", opens_with: "question" } },
  { name: "arc_floor_praise_then_cracked_shade", tags: { length: "long", intent: "delivery", opens_with: "question" } },
  { name: "hub_setup_then_missing_mount", tags: { length: "long", intent: "delivery", opens_with: "defect" } },
  { name: "strip_parcel_lost_concierge", tags: { length: "very_long", intent: "delivery", opens_with: "other" } },
  { name: "strip_wrong_length_received", tags: { length: "long", intent: "delivery", opens_with: "other" } },
  { name: "arc_desk_renovation_dimmer_question", tags: { length: "long", intent: "question", opens_with: "defect" } },
  { name: "zigbee_smart_home_planning", tags: { length: "very_long", intent: "question", opens_with: "other" } },
  { name: "warranty_moving_abroad_question", tags: { length: "long", intent: "question", opens_with: "delivery" } },
  { name: "nova_battery_winter_storage_question", tags: { length: "long", intent: "question", opens_with: "defect" } },
]

const PLANTED_DEFECTS: readonly DatasetCaseFixture[] = [
  { name: "strip_heat_clean", tags: { planted: "no", defect: "none", action: "store_credit" } },
  { name: "strip_heat_wrong_amount", tags: { planted: "yes", defect: "wrong_amount", action: "store_credit" } },
  { name: "bulb_router_clean", tags: { planted: "no", defect: "none", action: "advice" } },
  { name: "bulb_router_overpromise", tags: { planted: "yes", defect: "overpromise", action: "advice" } },
  { name: "crushed_lamp_clean", tags: { planted: "no", defect: "none", action: "reship" } },
  { name: "crushed_lamp_unsupported_claim", tags: { planted: "yes", defect: "unsupported_claim", action: "reship" } },
  { name: "nova_runtime_clean", tags: { planted: "no", defect: "none", action: "advice" } },
  { name: "nova_runtime_contradicts_source", tags: { planted: "yes", defect: "contradicts_source", action: "advice" } },
  { name: "nova_no_charge_clean", tags: { planted: "no", defect: "none", action: "replacement" } },
  { name: "nova_no_charge_fabricated_quote", tags: { planted: "yes", defect: "fabricated_quote", action: "replacement" } },
  { name: "zigbee_pairing_clean", tags: { planted: "no", defect: "none", action: "advice" } },
  { name: "zigbee_pairing_wrong_steps", tags: { planted: "yes", defect: "wrong_steps", action: "advice" } },
  { name: "burning_smell_clean", tags: { planted: "no", defect: "none", action: "replacement" } },
  { name: "burning_smell_missing_safety", tags: { planted: "yes", defect: "missing_safety", action: "replacement" } },
  { name: "gift_warranty_clean", tags: { planted: "no", defect: "none", action: "advice" } },
  { name: "gift_warranty_unanswered", tags: { planted: "yes", defect: "unanswered", action: "advice" } },
]

const PANEL_CASES: readonly DatasetCaseFixture[] = [
  { name: "panel_strip_heat_clear", tags: { contest: "clear", category: "light_strip", winner_position: "middle" } },
  { name: "panel_bulb_router_close", tags: { contest: "close", category: "smart_bulb", winner_position: "last" } },
  { name: "panel_crushed_lamp_clear", tags: { contest: "clear", category: "floor_lamp", winner_position: "first" } },
  { name: "panel_nova_runtime_close", tags: { contest: "close", category: "desk_lamp", winner_position: "last" } },
  { name: "panel_zigbee_pairing_clear", tags: { contest: "clear", category: "smart_bulb", winner_position: "middle" } },
  { name: "panel_dark_segment_close", tags: { contest: "close", category: "light_strip", winner_position: "first" } },
  { name: "panel_burning_smell_clear", tags: { contest: "clear", category: "floor_lamp", winner_position: "last" } },
  { name: "panel_dimmer_buzz_close", tags: { contest: "close", category: "desk_lamp", winner_position: "middle" } },
]

export const DATASETS: readonly DatasetFixture[] = [
  { id: ids.datasetId("support_case_cases"), flow: ids.flowId("support_case"), cases: SUPPORT_CASES },
  { id: ids.datasetId("long_customer_messages"), flow: null, cases: LONG_MESSAGES },
  { id: ids.datasetId("planted_defect_replies"), flow: null, cases: PLANTED_DEFECTS },
  { id: ids.datasetId("judge_panel_cases"), flow: ids.flowId("judge_panel"), cases: PANEL_CASES },
]

const SUPPORT_CASE = ids.flowId("support_case")
const JUDGE_PANEL = ids.flowId("judge_panel")
const POLISH = { from: ids.nodeId("polish"), to: ids.nodeId("polish") }

const replyNoninferiorMistral: ExperimentFixture = {
  id: ids.experimentId("reply_noninferior_mistral"),
  description: "mistral in the revision step of the polish loop is not worse than gpt by the critic's score, and a passing reply costs at most 20% more",
  flow: SUPPORT_CASE,
  subject: { kind: "range", flow: SUPPORT_CASE, range: POLISH },
  failureMode: "reply_quality",
  question: {
    kind: "noninferior",
    baseline: ids.variantId("gpt"),
    candidate: ids.variantId("mistral"),
    primary: ids.checkId("critique"),
    direction: "higher_is_better",
    margin: 0.05,
    relative: false,
    guardrails: [{ metric: "cost_of_pass", direction: "lower_is_better", margin: 0.2, relative: true }],
  },
  arms: [],
  dataset: ids.datasetId("support_case_cases"),
  tags: {},
  variants: [
    variant("gpt", "baseline", null, [assign("polish__revise", "gpt")]),
    variant("mistral", "candidate", null, [assign("polish__revise", "mistral", true)]),
  ],
  checks: [CRITIQUE, PROMISES],
  plan: { cases: 12, repeats: 3 },
  spread: 0.28,
  models: {
    gpt: model({ checks: { promises: 0.93 }, scores: { critique: 0.82 }, usd: 0.0135, latencyMs: 5200, schemaValid: 0.95 }),
    mistral: model({ checks: { promises: 0.92 }, scores: { critique: 0.815 }, usd: 0.0118, latencyMs: 6100, schemaValid: 0.9 }),
  },
}

const intentSplitLongMessages: ExperimentFixture = {
  id: ids.experimentId("intent_split_long_messages"),
  description: "Condensing a long customer message before deciding the intent beats deciding it from the whole message, at most 50% dearer per correct intent",
  flow: null,
  subject: { kind: "arm", arm: ids.armId("one_step"), range: null },
  failureMode: "intent_misread",
  question: {
    kind: "compare",
    baseline: ids.variantId("one_step"),
    candidate: ids.variantId("two_step"),
    primary: ids.checkId("intent"),
    direction: "higher_is_better",
    margin: 0.05,
    relative: false,
    guardrails: [{ metric: "cost_of_pass", direction: "lower_is_better", margin: 0.5, relative: true }],
  },
  arms: [
    arm("one_step", "The case intent straight from the customer's message, in one call to a cheap open model", [
      step("classify_message", "llm", "llama", "Decides the intent from the whole message"),
    ]),
    arm("two_step", "The case intent in two calls: the message is condensed to what the customer needs first, then the intent is decided from that summary", [
      step("condense_message", "llm", "llama", "Condenses the message to what the customer needs now, at most 600 characters"),
      step("classify_summary", "llm", "llama", "Decides the intent from the summary"),
    ]),
  ],
  dataset: ids.datasetId("long_customer_messages"),
  tags: {},
  variants: [
    variant("one_step", "baseline", "one_step", [assign("classify_message", "llama")]),
    variant("two_step", "candidate", "two_step", [assign("condense_message", "llama"), assign("classify_summary", "llama")]),
  ],
  checks: [expected("intent", ["intent"])],
  plan: { cases: 12, repeats: 3 },
  spread: 0.34,
  models: {
    one_step: model({ checks: { intent: 0.71 }, usd: 0.004, latencyMs: 1400, schemaValid: 0.93 }),
    two_step: model({ checks: { intent: 0.78 }, usd: 0.0055, latencyMs: 2600, schemaValid: 0.94 }),
  },
}

const critiquePlantedDefects: ExperimentFixture = {
  id: ids.experimentId("critique_planted_defects"),
  description: "The DeepSeek critic blocks replies with a planted defect and lets clean replies through: its verdict matches the label in more than 85% of cases",
  flow: null,
  subject: { kind: "arm", arm: ids.armId("critique_only"), range: null },
  failureMode: "judge_misses_defect",
  question: { kind: "threshold", metric: ids.checkId("label"), bound: "above", value: 0.85, margin: 0.05, variant: ids.variantId("deepseek") },
  arms: [
    arm("critique_only", "The reply critic on its own: the critique inference with the DeepSeek agent scores a finished reply, and the verdict step reads it as the polish loop does", [
      step("critique", "llm", "deepseek", "Scores a finished reply against the decision and the knowledge base chunks"),
      step("verdict", "code", null, "Sends the reply when the score reaches 0.85 and there are no blocking remarks"),
    ]),
  ],
  dataset: ids.datasetId("planted_defect_replies"),
  tags: {},
  variants: [variant("deepseek", "candidate", "critique_only", [assign("critique", "deepseek")])],
  checks: [expected("label", ["verdict"])],
  plan: { cases: 16, repeats: 3 },
  spread: 0.3,
  models: {
    deepseek: model({ checks: { label: 0.9 }, usd: 0.0019, latencyMs: 2400, schemaValid: 0.97 }),
  },
}

const replyLook: ExperimentFixture = {
  id: ids.experimentId("reply_look"),
  description: "A quick look at the polished reply on the regression cases after a change to the revision prompt: each case with its checks, cost and trace, no verdict",
  flow: SUPPORT_CASE,
  subject: { kind: "range", flow: SUPPORT_CASE, range: POLISH },
  failureMode: null,
  question: { kind: "look" },
  arms: [],
  dataset: ids.datasetId("support_case_cases"),
  tags: { regression: "yes" },
  variants: [variant("current", "other", null, [assign("polish__revise", "gpt")])],
  checks: [PROMISES, CRITIQUE],
  plan: { cases: null, repeats: 1 },
  spread: 0.28,
  models: {
    current: model({ checks: { promises: 0.9 }, scores: { critique: 0.8 }, usd: 0.0135, latencyMs: 5200 }),
  },
}

const replyOverpromiseRisk: ExperimentFixture = {
  id: ids.experimentId("reply_overpromise_risk"),
  description: "The polish loop keeps the reply within the decision in more than 97% of attempts: a refund, a replacement or an amount the decision does not give stays a rare failure",
  flow: SUPPORT_CASE,
  subject: { kind: "range", flow: SUPPORT_CASE, range: POLISH },
  failureMode: "overpromise",
  question: { kind: "threshold", metric: ids.checkId("promises"), bound: "above", value: 0.97, margin: 0.01, variant: null },
  arms: [],
  dataset: ids.datasetId("support_case_cases"),
  tags: {},
  variants: [variant("gpt", "candidate", null, [assign("polish__revise", "gpt")])],
  checks: [
    PROMISES,
    { id: ids.checkId("customer_language"), kind: "binary", source: { kind: "builtin", use: "language", fields: ["$out.reply.text"] } },
  ],
  plan: { cases: 12, repeats: 20 },
  spread: 0.12,
  models: {
    gpt: model({ checks: { promises: 0.985, customer_language: 0.998 }, usd: 0.0118, latencyMs: 5200 }),
  },
}

const intentEscalationAgents: ExperimentFixture = {
  id: ids.experimentId("intent_escalation_agents"),
  description: "Qwen as the escalation agent decides the support lead's intent at most 0.1 less often than DeepSeek on the recorded triage, with no more invalid first outputs and at most 25% slower at p95",
  flow: SUPPORT_CASE,
  subject: { kind: "arm", arm: ids.armId("escalation"), range: { from: ids.nodeId("escalate"), to: ids.nodeId("escalate") } },
  failureMode: "intent_misread",
  question: {
    kind: "noninferior",
    baseline: ids.variantId("deepseek"),
    candidate: ids.variantId("qwen"),
    primary: ids.checkId("intent"),
    direction: "higher_is_better",
    margin: 0.1,
    relative: false,
    guardrails: [
      { metric: "schema_valid_first_try", direction: "higher_is_better", margin: 0.05, relative: false },
      { metric: "latency_p95_ms", direction: "lower_is_better", margin: 0.25, relative: true },
    ],
  },
  arms: [
    arm("escalation", "The escalation path of the intent cascade: the product's normalization and attachment parsing, then the strong model that decides the intent when the cheap ballots split", [
      step("prepare", "code", null, "The product's normalization of the case"),
      step("triage", "llm", "gemini", "Parses the case and its attachments"),
      step("escalate", "llm", "deepseek", "Decides the intent when the cheap ballots split"),
    ]),
  ],
  dataset: ids.datasetId("support_case_cases"),
  tags: {},
  variants: [
    variant("deepseek", "baseline", "escalation", [assign("escalate", "deepseek")]),
    variant("qwen", "candidate", "escalation", [assign("escalate", "qwen", true)]),
    variant("gpt", "other", "escalation", [assign("escalate", "gpt", true)]),
  ],
  checks: [expected("intent", ["intent"])],
  plan: { cases: 12, repeats: 3 },
  spread: 0.3,
  models: {
    deepseek: model({ checks: { intent: 0.84 }, usd: 0.0011, latencyMs: 1900, schemaValid: 0.97 }),
    qwen: model({ checks: { intent: 0.81 }, usd: 0.0006, latencyMs: 1300, schemaValid: 0.91 }),
    gpt: model({ checks: { intent: 0.79 }, usd: 0.0009, latencyMs: 2600, schemaValid: 0.95 }),
  },
}

const judgePanelAgents: ExperimentFixture = {
  id: ids.experimentId("judge_panel_agents"),
  description: "A DeepSeek tie-break picks the expected winner more often than the gpt tie-break, at most 30% dearer per correct pick",
  flow: JUDGE_PANEL,
  subject: { kind: "flow", flow: JUDGE_PANEL },
  failureMode: "panel_wrong_winner",
  question: {
    kind: "compare",
    baseline: ids.variantId("gpt_tie_break"),
    candidate: ids.variantId("deepseek_tie_break"),
    primary: ids.checkId("winner"),
    direction: "higher_is_better",
    margin: 0.05,
    relative: false,
    guardrails: [
      { metric: "cost_of_pass", direction: "lower_is_better", margin: 0.3, relative: true },
      { metric: "latency_p95_ms", direction: "lower_is_better", margin: 0.5, relative: true },
    ],
  },
  arms: [],
  dataset: ids.datasetId("judge_panel_cases"),
  tags: {},
  variants: [
    variant("gpt_tie_break", "baseline", null, [assign("decide__tie_break", "gpt")]),
    variant("deepseek_tie_break", "candidate", null, [assign("decide__tie_break", "deepseek", true)]),
  ],
  checks: [expected("winner", ["winner"])],
  plan: { cases: 8, repeats: 3 },
  spread: 0.32,
  models: {
    gpt_tie_break: model({ checks: { winner: 0.86 }, usd: 0.0098, latencyMs: 7400, schemaValid: 0.96 }),
    deepseek_tie_break: model({ checks: { winner: 0.66 }, usd: 0.0105, latencyMs: 8100, schemaValid: 0.97 }),
  },
}

const panelSingleJudge: ExperimentFixture = {
  id: ids.experimentId("panel_single_judge"),
  description: "A single DeepSeek judge answers at least 1.5 s faster at the median than the three-judge panel, picks the expected winner at most 0.1 less often and fails no more runs",
  flow: JUDGE_PANEL,
  subject: { kind: "flow", flow: JUDGE_PANEL },
  failureMode: "panel_wrong_winner",
  question: {
    kind: "compare",
    baseline: ids.variantId("panel"),
    candidate: ids.variantId("single_judge"),
    primary: "latency_p50_ms",
    direction: "lower_is_better",
    margin: 1500,
    relative: false,
    guardrails: [
      { metric: ids.checkId("winner"), direction: "higher_is_better", margin: 0.1, relative: false },
      { metric: "success_rate", direction: "higher_is_better", margin: 0.05, relative: false },
      { metric: "infra_error_rate", direction: "lower_is_better", margin: 0.02, relative: false },
    ],
  },
  arms: [
    arm("single_judge", "One judge instead of the panel: the tie-break inference scores the candidates blind, and the panel's own pick step turns its verdict into the winner", [
      step("judge", "llm", "deepseek", "Scores the candidates blind with the tie-break inference"),
      step("pick", "code", null, "The panel's own pick step"),
    ]),
  ],
  dataset: ids.datasetId("judge_panel_cases"),
  tags: {},
  variants: [
    variant("panel", "baseline", null, [assign("judges__deepseek", "deepseek"), assign("judges__qwen", "qwen"), assign("judges__llama", "llama")]),
    variant("single_judge", "candidate", "single_judge", [assign("judge", "deepseek")]),
    variant("single_judge_qwen", "other", "single_judge", [assign("judge", "qwen", true)]),
  ],
  checks: [expected("winner", ["winner"])],
  plan: { cases: 8, repeats: 3 },
  spread: 2600,
  models: {
    panel: model({ checks: { winner: 0.85 }, usd: 0.0112, latencyMs: 7600, schemaValid: 0.96, infraError: 0.02 }),
    single_judge: model({ checks: { winner: 0.8 }, usd: 0.0041, latencyMs: 3900, schemaValid: 0.95, infraError: 0.32 }),
    single_judge_qwen: model({ checks: { winner: 0.74 }, usd: 0.0033, latencyMs: 3100, schemaValid: 0.9, infraError: 0.22 }),
  },
}

export const EXPERIMENTS: readonly ExperimentFixture[] = [
  replyNoninferiorMistral,
  intentSplitLongMessages,
  critiquePlantedDefects,
  replyLook,
  replyOverpromiseRisk,
  intentEscalationAgents,
  judgePanelAgents,
  panelSingleJudge,
]

export const LOOK_VARIANT = ids.variantId("current")

export const LOOK_CHECKS: readonly ExperimentCheck[] = [expected("expected", [])]

export const LOOK_MODEL: VariantModel = model({ checks: { expected: 0.82 }, usd: 0.0214, latencyMs: 41000, schemaValid: 0.94 })

export const notesOf = (experiment: ExperimentFixture): string | null => EXPERIMENT_NOTES[experiment.id] ?? null
