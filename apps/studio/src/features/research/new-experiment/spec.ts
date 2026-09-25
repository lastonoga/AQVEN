import type {
  CaseSelectionDraft,
  ExperimentCreate,
  ExperimentSpecJson,
  QuestionKind,
  SpecCasesJson,
  SpecCheckJson,
  SpecQuestionJson,
  SpecVariantJson,
  ThresholdBound,
} from "@/domain"
import * as ids from "@/data/ids"
import { authoringOf, type FactorAuthoring } from "./factor"
import { furtherVariants, type CheckDraft, type NewExperimentForm, type QuestionDraft, type VariantDraft } from "./form-state"

export const EXPECTED_USE = "expected"

const FIELD_SEPARATOR = /[\s,]+/

type JsonObject = Readonly<Record<string, unknown>>

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value)

export const numberOf = (text: string): number | null => {
  const trimmed = text.trim()
  if (trimmed.length === 0) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export const wholeOf = (text: string): number | null => {
  const value = numberOf(text)
  return value !== null && Number.isInteger(value) ? value : null
}

export const fieldsOf = (text: string): readonly string[] => text.split(FIELD_SEPARATOR).filter((field) => field.length > 0)

export const paramsOf = (text: string): JsonObject | null => {
  if (text.trim().length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    return isObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

const optional = <K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> => {
  if (value === null || value === undefined) return {}
  const entry: Partial<Record<K, V>> = {}
  entry[key] = value
  return entry
}

const nonEmpty = (text: string): string | null => (text.length === 0 ? null : text)

const withOf = (check: CheckDraft): JsonObject | null => {
  const params = paramsOf(check.params) ?? {}
  const fields = fieldsOf(check.fields)
  const merged = fields.length === 0 ? params : { ...params, fields }
  return Object.keys(merged).length === 0 ? null : merged
}

const checkOf = (check: CheckDraft): SpecCheckJson => ({ id: check.id, kind: check.kind, use: check.use, ...optional("with", withOf(check)) })

const BOUND: Readonly<Record<ThresholdBound, (value: number) => { readonly above?: number; readonly below?: number }>> = {
  above: (value) => ({ above: value }),
  below: (value) => ({ below: value }),
}

const marginOf = (draft: QuestionDraft): number => numberOf(draft.margin) ?? 0

const pairOf = (kind: "compare" | "noninferior") => (draft: QuestionDraft): SpecQuestionJson => ({
  kind,
  baseline: draft.baseline,
  candidate: draft.candidate,
  primary: draft.primary,
  margin: marginOf(draft),
})

const QUESTION: Readonly<Record<QuestionKind, (draft: QuestionDraft) => SpecQuestionJson>> = {
  look: () => ({ kind: "look" }),
  threshold: (draft) => ({
    kind: "threshold",
    metric: draft.metric,
    ...optional("variant", nonEmpty(draft.variant)),
    ...BOUND[draft.bound](numberOf(draft.value) ?? 0),
    margin: marginOf(draft),
  }),
  compare: pairOf("compare"),
  noninferior: pairOf("noninferior"),
}

export const promptName = (variant: VariantDraft): string => variant.id

const hasPrompt = (variant: VariantDraft): boolean => variant.prompt.trim().length > 0

const promptNodes = (form: NewExperimentForm, variant: VariantDraft): Readonly<Record<string, string>> =>
  hasPrompt(variant) ? Object.fromEntries(form.nodes.map((node) => [node, promptName(variant)])) : {}

const pickedNodes = (form: NewExperimentForm, variant: VariantDraft): Readonly<Record<string, string>> =>
  Object.fromEntries(form.nodes.flatMap((node) => {
    const value = variant.values[node]
    return value === undefined ? [] : [[node, value]]
  }))

type NodesOf = (form: NewExperimentForm, variant: VariantDraft) => Readonly<Record<string, string>>

const NODES_OF: Readonly<Record<FactorAuthoring, NodesOf>> = {
  pick: pickedNodes,
  text: promptNodes,
  chat: () => ({}),
}

export const variantNodes = (form: NewExperimentForm, variant: VariantDraft): Readonly<Record<string, string>> =>
  NODES_OF[authoringOf(form.factor)](form, variant)

const variantOf = (form: NewExperimentForm) => (variant: VariantDraft, index: number): SpecVariantJson => {
  const nodes = index === 0 ? {} : variantNodes(form, variant)
  return { id: variant.id, ...optional("nodes", Object.keys(nodes).length === 0 ? null : nodes) }
}

const casesOf = (cases: CaseSelectionDraft | null): SpecCasesJson => ({
  dataset: cases?.dataset ?? "",
  ...optional("tags", cases === null || Object.keys(cases.tags).length === 0 ? null : cases.tags),
})

const planOf = (form: NewExperimentForm) => ({ ...optional("cases", wholeOf(form.plan.cases)), repeats: wholeOf(form.plan.repeats) ?? 1 })

export const specOf = (form: NewExperimentForm): ExperimentSpecJson => ({
  apiVersion: "aqven/v1",
  kind: "Experiment",
  description: form.description.trim(),
  subject: { flow: form.flow ?? "" },
  ...optional("varies", form.nodes.length === 0 ? null : { what: form.factor, nodes: [...form.nodes] }),
  cases: casesOf(form.cases),
  variants: form.variants.map(variantOf(form)),
  ...optional("checks", form.checks.length === 0 ? null : form.checks.map(checkOf)),
  question: QUESTION[form.question.kind](form.question),
  plan: planOf(form),
})

export const promptsOf = (form: NewExperimentForm): Readonly<Record<string, string>> => {
  if (authoringOf(form.factor) !== "text" || form.nodes.length === 0) return {}
  return Object.fromEntries(furtherVariants(form).filter(hasPrompt).map((variant) => [promptName(variant), variant.prompt]))
}

export const createOf = (form: NewExperimentForm): ExperimentCreate => ({
  experiment: ids.experimentId(form.id),
  spec: specOf(form),
  prompts: promptsOf(form),
})

export const promptPath = (experiment: string, variant: VariantDraft): string => `experiments/${experiment}/prompts/${promptName(variant)}.md`

export const specPath = (experiment: string): string => `experiments/${experiment}/experiment.yaml`
