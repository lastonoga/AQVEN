import type { components } from "@/api/schema"
import type { SeriesSplit } from "@/domain"
import { SERIES_SPLITS } from "@/domain"
import { CASE_NAMES } from "./research"

type S = components["schemas"]

type Tags = Readonly<Record<string, string>>

export type AuthoringCase = { readonly name: string; readonly split: SeriesSplit; readonly tags: Tags }

export type AuthoringDatasetSeed = { readonly datasetId: string; readonly flowId: string | null; readonly cases: readonly AuthoringCase[] }

const SUPPORT_TAGS: Readonly<Record<string, Tags>> = {
  strip_flicker_credit: { lamp_kind: "smart_wifi", channel: "amazon", action: "store_credit", regression: "no", length: "long" },
  bulb_app_offline_advice: { lamp_kind: "smart_wifi", channel: "storefront", action: "advice", regression: "yes", length: "short" },
  lamp_crushed_box_reship: { lamp_kind: "mains", channel: "ozon", action: "reship", regression: "yes", length: "long" },
  candle_flicker_credit: { lamp_kind: "smart_zigbee", channel: "storefront", action: "store_credit", regression: "yes", length: "short" },
  dimmer_buzz_advice: { lamp_kind: "mains", channel: "ozon", action: "advice", regression: "yes", length: "short" },
  hub_missing_mount_reship: { lamp_kind: "none", channel: "amazon", action: "reship", regression: "no", length: "short" },
  arc_floor_burning_smell_replacement: { lamp_kind: "mains", channel: "storefront", action: "replacement", regression: "no", length: "long" },
  nova_gift_warranty_question: { lamp_kind: "smart_wifi", channel: "amazon", action: "advice", regression: "no", length: "long" },
  nova_no_charge_replacement: { lamp_kind: "smart_wifi", channel: "ozon", action: "replacement", regression: "yes", length: "short" },
  nova_runtime_advice: { lamp_kind: "smart_wifi", channel: "storefront", action: "advice", regression: "no", length: "long" },
  strip_dead_segment_replacement: { lamp_kind: "smart_wifi", channel: "amazon", action: "replacement", regression: "no", length: "short" },
  zigbee_pairing_advice: { lamp_kind: "smart_zigbee", channel: "ozon", action: "advice", regression: "no", length: "short" },
}

const DEFECTS = ["wrong_amount", "made_up_policy", "wrong_product", "unsafe_advice"] as const

const PLANTED_PER_SPLIT = 4

const plantedTags = (_name: string, index: number): Tags =>
  index < PLANTED_PER_SPLIT ? { planted: "yes", defect: DEFECTS[index % DEFECTS.length] ?? "wrong_amount" } : { planted: "no", defect: "none" }

const lengthTags = (_name: string, index: number): Tags => ({ length: index % 2 === 0 ? "long" : "very_long" })

const panelTags = (_name: string, index: number): Tags => ({ difficulty: index % 2 === 0 ? "easy" : "hard" })

const supportTags = (name: string): Tags => SUPPORT_TAGS[name] ?? {}

type Tagger = (name: string, index: number) => Tags

const casesOf = (datasetId: string, tagger: Tagger): readonly AuthoringCase[] =>
  SERIES_SPLITS.flatMap((split) => (CASE_NAMES[datasetId]?.[split] ?? []).map((name, index) => ({ name, split, tags: tagger(name, index) })))

export const authoringDatasets: readonly AuthoringDatasetSeed[] = [
  { datasetId: "support_case_cases", flowId: "support_case", cases: casesOf("support_case_cases", supportTags) },
  { datasetId: "judge_panel_cases", flowId: "judge_panel", cases: casesOf("judge_panel_cases", panelTags) },
  { datasetId: "planted_defect_replies", flowId: null, cases: casesOf("planted_defect_replies", plantedTags) },
  { datasetId: "long_customer_messages", flowId: null, cases: casesOf("long_customer_messages", lengthTags) },
]

export const CALL_TARGETS: Readonly<Record<string, string>> = { "support_case/panel": "judge_panel" }

export const AUTHORING_EVALUATORS: readonly S["EvaluatorOptionView"][] = [
  {
    use: "expected",
    needs_params: false,
    kind: "binary",
    params: [{ name: "fields", required: false }],
    description: "The output equals the case expected_output, whole or on the listed fields",
  },
  {
    use: "max_words",
    needs_params: true,
    kind: "binary",
    params: [
      { name: "field", required: true },
      { name: "max", required: true },
    ],
    description: "A text field has at most max words",
  },
  { use: "cost_usd", needs_params: false, kind: "continuous", params: [], description: "The cost of the attempt in USD, as a score" },
]

export const AUTHORING_METRICS: readonly S["SeriesMetric"][] = [
  "success_rate",
  "cost_usd",
  "cost_of_pass",
  "latency_p50_ms",
  "latency_p95_ms",
  "schema_valid_first_try",
  "infra_error_rate",
]
