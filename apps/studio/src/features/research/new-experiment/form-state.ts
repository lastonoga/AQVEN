import type { CaseSelectionDraft, CheckKind, DatasetId, FactorKind, FlowId, NodeId, QuestionKind, ThresholdBound } from "@/domain"

export const NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/
export const MAX_REPEATS = 20
export const AS_WRITTEN = "as_written"
export const DEFAULT_METRIC = "success_rate"

const NAME_LIMIT = 63
const NOT_NAME = /[^a-z0-9]+/g
const EDGE_UNDERSCORES = /^_+|_+$/g
const LEADING_NON_LETTERS = /^[^a-z]+/
const VARIANT_PREFIX = "variant"

export type VariantDraft = {
  readonly key: number
  readonly id: string
  readonly named: boolean
  readonly values: Readonly<Record<string, string>>
  readonly prompt: string
}

export type CheckDraft = {
  readonly key: number
  readonly id: string
  readonly use: string
  readonly kind: CheckKind
  readonly fields: string
  readonly params: string
}

export type QuestionDraft = {
  readonly kind: QuestionKind
  readonly baseline: string
  readonly candidate: string
  readonly primary: string
  readonly margin: string
  readonly metric: string
  readonly bound: ThresholdBound
  readonly value: string
  readonly variant: string
}

export type PlanDraft = { readonly cases: string; readonly repeats: string }

export type NewExperimentForm = {
  readonly description: string
  readonly id: string
  readonly idEdited: boolean
  readonly flow: FlowId | null
  readonly factor: FactorKind
  readonly nodes: readonly NodeId[]
  readonly variants: readonly VariantDraft[]
  readonly cases: CaseSelectionDraft | null
  readonly checks: readonly CheckDraft[]
  readonly question: QuestionDraft
  readonly plan: PlanDraft
  readonly nextKey: number
}

export type FormAction =
  | { readonly type: "describe"; readonly text: string }
  | { readonly type: "rename"; readonly id: string }
  | { readonly type: "chooseFlow"; readonly flow: FlowId; readonly dataset: DatasetId | null }
  | { readonly type: "chooseFactor"; readonly what: FactorKind }
  | { readonly type: "toggleNode"; readonly node: NodeId }
  | { readonly type: "addVariant" }
  | { readonly type: "removeVariant"; readonly key: number }
  | { readonly type: "renameVariant"; readonly key: number; readonly id: string }
  | { readonly type: "setValue"; readonly key: number; readonly node: NodeId; readonly value: string }
  | { readonly type: "setPrompt"; readonly key: number; readonly text: string }
  | { readonly type: "chooseCases"; readonly cases: CaseSelectionDraft }
  | { readonly type: "addCheck"; readonly use: string; readonly kind: CheckKind }
  | { readonly type: "removeCheck"; readonly key: number }
  | { readonly type: "editCheck"; readonly key: number; readonly patch: Partial<Pick<CheckDraft, "id" | "kind" | "fields" | "params">> }
  | { readonly type: "editQuestion"; readonly patch: Partial<QuestionDraft> }
  | { readonly type: "editPlan"; readonly patch: Partial<PlanDraft> }

type ActionOf<T extends FormAction["type"]> = Extract<FormAction, { readonly type: T }>

type Handlers = { readonly [T in FormAction["type"]]: (form: NewExperimentForm, action: ActionOf<T>) => NewExperimentForm }

const EMPTY_QUESTION: QuestionDraft = {
  kind: "look",
  baseline: "",
  candidate: "",
  primary: "",
  margin: "",
  metric: "",
  bound: "above",
  value: "",
  variant: "",
}

const variantDraft = (key: number, id: string): VariantDraft => ({ key, id, named: false, values: {}, prompt: "" })

export const initialForm = (): NewExperimentForm => ({
  description: "",
  id: "",
  idEdited: false,
  flow: null,
  factor: "agent",
  nodes: [],
  variants: [variantDraft(0, AS_WRITTEN), variantDraft(1, `${VARIANT_PREFIX}_2`)],
  cases: null,
  checks: [],
  question: EMPTY_QUESTION,
  plan: { cases: "", repeats: "1" },
  nextKey: 2,
})

export const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(NOT_NAME, "_")
    .replace(LEADING_NON_LETTERS, "")
    .slice(0, NAME_LIMIT)
    .replace(EDGE_UNDERSCORES, "")

export const uniqueName = (base: string, taken: readonly string[]): string => {
  if (!taken.includes(base)) return base
  const suffix = (index: number): string => `${base.slice(0, NAME_LIMIT - String(index).length - 1)}_${String(index)}`
  const free = Array.from({ length: taken.length + 1 }, (_, offset) => suffix(offset + 2)).find((name) => !taken.includes(name))
  return free ?? base
}

const withoutKey = (record: Readonly<Record<string, string>>, key: string): Readonly<Record<string, string>> =>
  Object.fromEntries(Object.entries(record).filter(([name]) => name !== key))

const followName = (value: string, from: string, to: string): string => (value === from ? to : value)

const variantIds = (form: NewExperimentForm, except: number): readonly string[] =>
  form.variants.filter((variant) => variant.key !== except).map((variant) => variant.id)

const updateVariant = (form: NewExperimentForm, key: number, change: (variant: VariantDraft) => VariantDraft): NewExperimentForm => ({
  ...form,
  variants: form.variants.map((variant) => (variant.key === key ? change(variant) : variant)),
})

const renameInQuestion = (question: QuestionDraft, from: string, to: string): QuestionDraft => ({
  ...question,
  baseline: followName(question.baseline, from, to),
  candidate: followName(question.candidate, from, to),
  variant: followName(question.variant, from, to),
})

const renameMetric = (question: QuestionDraft, from: string, to: string): QuestionDraft => ({
  ...question,
  primary: followName(question.primary, from, to),
  metric: followName(question.metric, from, to),
})

const autoName = (form: NewExperimentForm, variant: VariantDraft, values: Readonly<Record<string, string>>): string => {
  const slug = slugOf([...new Set(Object.values(values))].join("_"))
  if (variant.named || slug.length === 0) return variant.id
  return uniqueName(slug, variantIds(form, variant.key))
}

const firstMetric = (form: NewExperimentForm): string => form.checks[0]?.id ?? DEFAULT_METRIC

const orDefault = (value: string, fallback: string): string => (value.length === 0 ? fallback : value)

const questionDefaults = (form: NewExperimentForm, question: QuestionDraft): QuestionDraft => ({
  ...question,
  baseline: orDefault(question.baseline, form.variants[0]?.id ?? ""),
  candidate: orDefault(question.candidate, form.variants[1]?.id ?? ""),
  primary: orDefault(question.primary, firstMetric(form)),
  metric: orDefault(question.metric, firstMetric(form)),
})

const defaultVariantId = (index: number): string => `${VARIANT_PREFIX}_${String(index + 1)}`

const keepsId = (variant: VariantDraft, index: number): boolean => variant.named || index === 0 || Object.keys(variant.values).length === 0

const clearedVariant = (variant: VariantDraft, index: number): VariantDraft => ({
  ...variant,
  id: keepsId(variant, index) ? variant.id : defaultVariantId(index),
  values: {},
})

const withoutValues = (form: NewExperimentForm): Pick<NewExperimentForm, "variants" | "question"> => {
  const variants = form.variants.map(clearedVariant)
  const question = form.variants.reduce((current, variant, index) => renameInQuestion(current, variant.id, variants[index]?.id ?? variant.id), form.question)
  return { variants, question }
}

const renameVariant = (form: NewExperimentForm, key: number, id: string): NewExperimentForm => {
  const current = form.variants.find((variant) => variant.key === key)
  if (current === undefined) return form
  const renamed = updateVariant(form, key, (variant) => ({ ...variant, id, named: true }))
  return { ...renamed, question: renameInQuestion(form.question, current.id, id) }
}

const setValue = (form: NewExperimentForm, action: ActionOf<"setValue">): NewExperimentForm => {
  const current = form.variants.find((variant) => variant.key === action.key)
  if (current === undefined) return form
  const values = action.value.length === 0 ? withoutKey(current.values, action.node) : { ...current.values, [action.node]: action.value }
  const id = autoName(form, current, values)
  const changed = updateVariant(form, action.key, (variant) => ({ ...variant, id, values }))
  return { ...changed, question: renameInQuestion(form.question, current.id, id) }
}

const removeVariant = (form: NewExperimentForm, key: number): NewExperimentForm => {
  const [first] = form.variants
  const removed = form.variants.find((variant) => variant.key === key)
  if (first === undefined || removed === undefined || first.key === key) return form
  return { ...form, variants: form.variants.filter((variant) => variant.key !== key), question: renameInQuestion(form.question, removed.id, "") }
}

const addVariant = (form: NewExperimentForm): NewExperimentForm => {
  const id = uniqueName(defaultVariantId(form.variants.length), variantIds(form, -1))
  return { ...form, variants: [...form.variants, variantDraft(form.nextKey, id)], nextKey: form.nextKey + 1 }
}

const toggleNode = (form: NewExperimentForm, node: NodeId): NewExperimentForm => {
  if (!form.nodes.includes(node)) return { ...form, nodes: [...form.nodes, node] }
  return {
    ...form,
    nodes: form.nodes.filter((item) => item !== node),
    variants: form.variants.map((variant) => ({ ...variant, values: withoutKey(variant.values, node) })),
  }
}

const addCheck = (form: NewExperimentForm, { use, kind }: ActionOf<"addCheck">): NewExperimentForm => {
  const id = uniqueName(slugOf(use), form.checks.map((check) => check.id))
  const check: CheckDraft = { key: form.nextKey, id, use, kind, fields: "", params: "" }
  return { ...form, checks: [...form.checks, check], nextKey: form.nextKey + 1 }
}

const removeCheck = (form: NewExperimentForm, key: number): NewExperimentForm => {
  const removed = form.checks.find((check) => check.key === key)
  if (removed === undefined) return form
  return { ...form, checks: form.checks.filter((check) => check.key !== key), question: renameMetric(form.question, removed.id, "") }
}

const editCheck = (form: NewExperimentForm, action: ActionOf<"editCheck">): NewExperimentForm => {
  const current = form.checks.find((check) => check.key === action.key)
  if (current === undefined) return form
  const next = { ...current, ...action.patch }
  return {
    ...form,
    checks: form.checks.map((check) => (check.key === action.key ? next : check)),
    question: renameMetric(form.question, current.id, next.id),
  }
}

const describe = (form: NewExperimentForm, text: string): NewExperimentForm => ({
  ...form,
  description: text,
  id: form.idEdited ? form.id : slugOf(text),
})

const HANDLERS: Handlers = {
  describe: (form, action) => describe(form, action.text),
  rename: (form, action) => ({ ...form, id: action.id, idEdited: action.id.length > 0 }),
  chooseFlow: (form, action) => ({
    ...form,
    flow: action.flow,
    nodes: [],
    ...withoutValues(form),
    cases: action.dataset === null ? null : { dataset: action.dataset, tags: {} },
  }),
  chooseFactor: (form, action) => ({ ...form, factor: action.what, nodes: [], ...withoutValues(form) }),
  toggleNode: (form, action) => toggleNode(form, action.node),
  addVariant: (form) => addVariant(form),
  removeVariant: (form, action) => removeVariant(form, action.key),
  renameVariant: (form, action) => renameVariant(form, action.key, action.id),
  setValue,
  setPrompt: (form, action) => updateVariant(form, action.key, (variant) => ({ ...variant, prompt: action.text })),
  chooseCases: (form, action) => ({ ...form, cases: action.cases }),
  addCheck,
  removeCheck: (form, action) => removeCheck(form, action.key),
  editCheck,
  editQuestion: (form, action) => ({ ...form, question: questionDefaults(form, { ...form.question, ...action.patch }) }),
  editPlan: (form, action) => ({ ...form, plan: { ...form.plan, ...action.patch } }),
}

const handle = <T extends FormAction["type"]>(form: NewExperimentForm, action: ActionOf<T>): NewExperimentForm => {
  const handler: (form: NewExperimentForm, action: ActionOf<T>) => NewExperimentForm = HANDLERS[action.type]
  return handler(form, action)
}

export const reduceForm = (form: NewExperimentForm, action: FormAction): NewExperimentForm => handle(form, action)

export const furtherVariants = (form: NewExperimentForm): readonly VariantDraft[] => form.variants.slice(1)
