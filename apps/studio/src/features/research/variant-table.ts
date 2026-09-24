import type { AgentRef, ArmId, ExperimentDetail, ExperimentQuestion, ExperimentSubject, ExperimentVariant, NodeId, NodeRange, VariantId, VariantRole } from "@/domain"

export type RowRole = VariantRole | "tested"

export type Named = { readonly short: string; readonly full: string }

export type AgentModel = { readonly agent: string; readonly model: Named }

export type StepSwap = { readonly node: NodeId; readonly from: AgentModel; readonly to: AgentModel }

export type VariantChange =
  | { readonly kind: "reference" }
  | { readonly kind: "swaps"; readonly swaps: readonly StepSwap[] }
  | { readonly kind: "steps"; readonly steps: readonly NodeId[] }

export type VariantRow = {
  readonly id: VariantId
  readonly role: RowRole
  readonly change: VariantChange
  readonly agents: readonly AgentModel[]
}

export type ChangeColumn =
  | { readonly kind: "none" }
  | { readonly kind: "baseline" }
  | { readonly kind: "reference"; readonly variant: VariantId }
  | { readonly kind: "steps" }

export type VariantTable = { readonly column: ChangeColumn; readonly rows: readonly VariantRow[] }

export type Where = ExperimentSubject | { readonly kind: "arms"; readonly arms: readonly ArmId[] }

export type WhereKind = "flow" | "arm" | "arms"

export type WhereView = { readonly kind: WhereKind; readonly name: string; readonly range: NodeRange | null }

type Subject = Pick<ExperimentDetail, "subject" | "arms" | "variants" | "question">

const PROVIDER_MARK = ":"
const VENDOR_MARK = "/"
const NESTING_MARK = "__"
const STEP_JOIN = " › "
const ARM_JOIN = ", "
const PAIR = 2
const NO_COLUMN: ChangeColumn = { kind: "none" }
const STEPS_COLUMN: ChangeColumn = { kind: "steps" }
const BASELINE_COLUMN: ChangeColumn = { kind: "baseline" }
const REFERENCE: VariantChange = { kind: "reference" }

export const shortModel = (model: string): string => {
  const bare = model.slice(model.indexOf(PROVIDER_MARK) + 1)
  return bare.slice(bare.lastIndexOf(VENDOR_MARK) + 1)
}

export const stepName = (node: string): string => node.split(NESTING_MARK).join(STEP_JOIN)

const modelOf = (model: string): Named => ({ short: shortModel(model), full: model })

const agentModelOf = (agent: AgentRef): AgentModel => ({ agent: agent.id, model: modelOf(agent.model) })

const isPair = (question: ExperimentQuestion): question is Extract<ExperimentQuestion, { readonly baseline: VariantId }> =>
  question.kind === "compare" || question.kind === "noninferior"

export const variantArm = (experiment: Pick<ExperimentDetail, "subject">, variant: ExperimentVariant): ArmId | null =>
  variant.arm ?? (experiment.subject.kind === "arm" ? experiment.subject.arm : null)

const distinctArms = (experiment: Subject): number => new Set(experiment.variants.map((variant) => variantArm(experiment, variant))).size

export const whereOf = (experiment: Pick<ExperimentDetail, "subject" | "variants">): Where => {
  const arms = [...new Set(experiment.variants.flatMap((variant) => variantArm(experiment, variant) ?? []))]
  if (arms.length > 1) return { kind: "arms", arms }
  return experiment.subject
}

export const whereView = (where: Where): WhereView => {
  if (where.kind === "arms") return { kind: "arms", name: where.arms.join(ARM_JOIN), range: null }
  if (where.kind === "arm") return { kind: "arm", name: where.arm, range: where.range }
  if (where.kind === "range") return { kind: "flow", name: where.flow, range: where.range }
  return { kind: "flow", name: where.flow, range: null }
}

export const rowRole = (question: ExperimentQuestion, variant: Pick<ExperimentVariant, "id" | "role">): RowRole => {
  if (question.kind === "look") return "tested"
  if (question.kind !== "threshold") return variant.role
  if (question.variant === null || question.variant === variant.id) return "tested"
  return "other"
}

const referenceOf = (experiment: Subject): ExperimentVariant | null => {
  const { question, variants } = experiment
  if (!isPair(question)) return variants[0] ?? null
  return variants.find((variant) => variant.id === question.baseline) ?? null
}

export const changeColumn = (experiment: Subject): ChangeColumn => {
  const reference = referenceOf(experiment)
  if (experiment.variants.length < PAIR || reference === null) return NO_COLUMN
  if (distinctArms(experiment) > 1) return STEPS_COLUMN
  if (isPair(experiment.question)) return BASELINE_COLUMN
  return { kind: "reference", variant: reference.id }
}

const agentAt = (experiment: Subject, variant: ExperimentVariant, node: NodeId): AgentRef | null => {
  const assigned = variant.assignments.find((item) => item.node === node)
  if (assigned !== undefined) return assigned.agent
  const arm = experiment.arms.find((item) => item.id === variantArm(experiment, variant))
  return arm?.steps.find((step) => step.node === node)?.agent ?? null
}

const swapOf = (node: NodeId, from: AgentRef | null, to: AgentRef | null): readonly StepSwap[] => {
  if (from === null || to === null) return []
  if (from.id === to.id && from.model === to.model) return []
  return [{ node, from: agentModelOf(from), to: agentModelOf(to) }]
}

export const swapsBetween = (experiment: Subject, reference: ExperimentVariant, variant: ExperimentVariant): readonly StepSwap[] => {
  const nodes = [...new Set([...reference.assignments, ...variant.assignments].map((item) => item.node))]
  return nodes.flatMap((node) => swapOf(node, agentAt(experiment, reference, node), agentAt(experiment, variant, node)))
}

const stepsOf = (experiment: Subject, variant: ExperimentVariant): readonly NodeId[] => {
  const arm = experiment.arms.find((item) => item.id === variantArm(experiment, variant))
  return arm?.steps.map((step) => step.node) ?? variant.assignments.map((item) => item.node)
}

export const agentsOf = (variant: ExperimentVariant): readonly AgentModel[] =>
  [...new Map(variant.assignments.map((item) => [item.agent.id, agentModelOf(item.agent)] as const)).values()]

const changeOf = (experiment: Subject, column: ChangeColumn, reference: ExperimentVariant | null, variant: ExperimentVariant): VariantChange => {
  if (column.kind === "steps") return { kind: "steps", steps: stepsOf(experiment, variant) }
  if (reference === null || reference.id === variant.id) return REFERENCE
  return { kind: "swaps", swaps: swapsBetween(experiment, reference, variant) }
}

export const variantTable = (experiment: Subject): VariantTable => {
  const column = changeColumn(experiment)
  const reference = referenceOf(experiment)
  return {
    column,
    rows: experiment.variants.map((variant) => ({
      id: variant.id,
      role: rowRole(experiment.question, variant),
      change: changeOf(experiment, column, reference, variant),
      agents: agentsOf(variant),
    })),
  }
}
