import type { AuthoringOptions, QuestionKind } from "@/domain"
import { authoringOf, flowById } from "./factor"
import { furtherVariants, MAX_REPEATS, NAME_PATTERN, type CheckDraft, type NewExperimentForm, type VariantDraft } from "./form-state"
import { numberOf, paramsOf, variantNodes, wholeOf } from "./spec"

export const PROBLEM_CODES = [
  "descriptionMissing",
  "idMissing",
  "idPattern",
  "idTaken",
  "flowMissing",
  "flowUnknown",
  "useNeedsChat",
  "variantIdPattern",
  "variantIdDuplicate",
  "variantValueMissing",
  "datasetMissing",
  "checkIdPattern",
  "checkIdDuplicate",
  "checkParamsInvalid",
  "pairNeedsTwoVariants",
  "pairVariantUnknown",
  "pairSame",
  "metricMissing",
  "metricUnknown",
  "variantUnknown",
  "valueInvalid",
  "marginInvalid",
  "marginPositive",
  "planCasesInvalid",
  "planRepeatsInvalid",
] as const

export type ProblemCode = (typeof PROBLEM_CODES)[number]

export type ProblemPlace = "description" | "id" | "subject" | "factor" | `variant:${string}` | "cases" | `check:${string}` | "question" | "plan"

export type FormProblem = { readonly place: ProblemPlace; readonly code: ProblemCode }

export type ProblemContext = { readonly options: AuthoringOptions; readonly taken: readonly string[] }

type Rule = (form: NewExperimentForm, context: ProblemContext) => readonly FormProblem[]

const NONE: readonly FormProblem[] = []

const at = (place: ProblemPlace, code: ProblemCode): readonly FormProblem[] => [{ place, code }]

const when = (condition: boolean, place: ProblemPlace, code: ProblemCode): readonly FormProblem[] => (condition ? at(place, code) : NONE)

const variantPlace = (variant: VariantDraft): ProblemPlace => `variant:${String(variant.key)}`

const checkPlace = (check: CheckDraft): ProblemPlace => `check:${String(check.key)}`

const isName = (text: string): boolean => NAME_PATTERN.test(text)

const repeated = (names: readonly string[], name: string): boolean => names.filter((item) => item === name).length > 1

const firstOf = (...lists: readonly (readonly FormProblem[])[]): readonly FormProblem[] => lists.find((list) => list.length > 0) ?? NONE

const aboutRule: Rule = (form, { taken }) => [
  ...when(form.description.trim().length === 0, "description", "descriptionMissing"),
  ...firstOf(when(form.id.length === 0, "id", "idMissing"), when(!isName(form.id), "id", "idPattern"), when(taken.includes(form.id), "id", "idTaken")),
]

const subjectRule: Rule = (form, { options }) =>
  firstOf(when(form.flow === null, "subject", "flowMissing"), when(flowById(options, form.flow) === null, "subject", "flowUnknown"))

const factorRule: Rule = (form) => when(form.nodes.length > 0 && authoringOf(form.factor) === "chat", "factor", "useNeedsChat")

const variantIdProblems = (variant: VariantDraft, ids: readonly string[]): readonly FormProblem[] =>
  firstOf(when(!isName(variant.id), variantPlace(variant), "variantIdPattern"), when(repeated(ids, variant.id), variantPlace(variant), "variantIdDuplicate"))

const unchanged = (form: NewExperimentForm, variant: VariantDraft): boolean => Object.keys(variantNodes(form, variant)).length === 0

const variantValueProblems = (form: NewExperimentForm): readonly FormProblem[] => {
  if (form.nodes.length === 0 || authoringOf(form.factor) === "chat") return NONE
  return furtherVariants(form).flatMap((variant) => when(unchanged(form, variant), variantPlace(variant), "variantValueMissing"))
}

const variantsRule: Rule = (form) => {
  const ids = form.variants.map((variant) => variant.id)
  return [...form.variants.flatMap((variant) => variantIdProblems(variant, ids)), ...variantValueProblems(form)]
}

const casesRule: Rule = (form) => when(form.cases === null, "cases", "datasetMissing")

const checkProblems = (check: CheckDraft, ids: readonly string[]): readonly FormProblem[] => [
  ...firstOf(when(!isName(check.id), checkPlace(check), "checkIdPattern"), when(repeated(ids, check.id), checkPlace(check), "checkIdDuplicate")),
  ...when(paramsOf(check.params) === null, checkPlace(check), "checkParamsInvalid"),
]

const checksRule: Rule = (form) => {
  const ids = form.checks.map((check) => check.id)
  return form.checks.flatMap((check) => checkProblems(check, ids))
}

const metricsOf = (form: NewExperimentForm, options: AuthoringOptions): readonly string[] => [...form.checks.map((check) => check.id), ...options.metrics]

const metricProblems = (metric: string, form: NewExperimentForm, options: AuthoringOptions): readonly FormProblem[] =>
  firstOf(when(metric.length === 0, "question", "metricMissing"), when(!metricsOf(form, options).includes(metric), "question", "metricUnknown"))

const marginProblems = (text: string): readonly FormProblem[] => {
  const margin = numberOf(text)
  return when(text.trim().length > 0 && (margin === null || margin < 0), "question", "marginInvalid")
}

const variantIds = (form: NewExperimentForm): readonly string[] => form.variants.map((variant) => variant.id)

const pairProblems = (form: NewExperimentForm): readonly FormProblem[] => {
  const { baseline, candidate } = form.question
  const known = variantIds(form)
  return firstOf(
    when(form.variants.length < 2, "question", "pairNeedsTwoVariants"),
    when(!known.includes(baseline) || !known.includes(candidate), "question", "pairVariantUnknown"),
    when(baseline === candidate, "question", "pairSame"),
  )
}

const positiveMargin = (text: string): readonly FormProblem[] => {
  const margin = numberOf(text)
  return when(margin === null || margin <= 0, "question", "marginPositive")
}

const QUESTION_RULES: Readonly<Record<QuestionKind, Rule>> = {
  look: () => NONE,
  threshold: (form, { options }) => [
    ...metricProblems(form.question.metric, form, options),
    ...when(numberOf(form.question.value) === null, "question", "valueInvalid"),
    ...marginProblems(form.question.margin),
    ...when(form.question.variant.length > 0 && !variantIds(form).includes(form.question.variant), "question", "variantUnknown"),
  ],
  compare: (form, { options }) => [...pairProblems(form), ...metricProblems(form.question.primary, form, options), ...marginProblems(form.question.margin)],
  noninferior: (form, { options }) => [...pairProblems(form), ...metricProblems(form.question.primary, form, options), ...positiveMargin(form.question.margin)],
}

const questionRule: Rule = (form, context) => QUESTION_RULES[form.question.kind](form, context)

const planRule: Rule = (form) => {
  const cases = wholeOf(form.plan.cases)
  const repeats = wholeOf(form.plan.repeats)
  return [
    ...when(form.plan.cases.trim().length > 0 && (cases === null || cases < 1), "plan", "planCasesInvalid"),
    ...when(repeats === null || repeats < 1 || repeats > MAX_REPEATS, "plan", "planRepeatsInvalid"),
  ]
}

const RULES: readonly Rule[] = [aboutRule, subjectRule, factorRule, variantsRule, casesRule, checksRule, questionRule, planRule]

export const formProblems = (form: NewExperimentForm, context: ProblemContext): readonly FormProblem[] => RULES.flatMap((rule) => rule(form, context))

export const problemsAt = (problems: readonly FormProblem[], place: ProblemPlace): readonly FormProblem[] => problems.filter((problem) => problem.place === place)
