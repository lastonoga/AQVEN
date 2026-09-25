import type { AgentRef, ExperimentDetail, ExperimentFactor, ExperimentQuestion, ExperimentSubject, ExperimentVariant, FactorChange, NodeId, NodeRange, VariantId, VariantRole } from "@/domain"
import * as ids from "@/data/ids"

export type RowRole = VariantRole | "tested"

export type Named = { readonly short: string; readonly full: string }

export type AgentModel = { readonly agent: string; readonly model: Named }

export type FactorValue = { readonly node: NodeId; readonly value: string }

export type VariantValue =
  | { readonly kind: "written" }
  | { readonly kind: "same"; readonly value: string }
  | { readonly kind: "nodes"; readonly values: readonly FactorValue[] }

export type VariantRow = {
  readonly id: VariantId
  readonly role: RowRole
  readonly value: VariantValue
  readonly agents: readonly AgentModel[]
}

export type VariantTable = { readonly factor: ExperimentFactor | null; readonly rows: readonly VariantRow[] }

export type WhereKind = "flow" | "local"

export type WhereView = { readonly kind: WhereKind; readonly name: string; readonly range: NodeRange | null }

type Subject = Pick<ExperimentDetail, "varies" | "variants" | "question">

const PROVIDER_MARK = ":"
const VENDOR_MARK = "/"
const NESTING_MARK = "__"
const STEP_JOIN = " › "
const WRITTEN: VariantValue = { kind: "written" }

export const shortModel = (model: string): string => {
  const bare = model.slice(model.indexOf(PROVIDER_MARK) + 1)
  return bare.slice(bare.lastIndexOf(VENDOR_MARK) + 1)
}

export const stepName = (node: string): string => node.split(NESTING_MARK).join(STEP_JOIN)

export const localNode = (node: string): NodeId => ids.nodeId(node.split(NESTING_MARK).at(-1) ?? node)

const modelOf = (model: string): Named => ({ short: shortModel(model), full: model })

const agentModelOf = (agent: AgentRef): AgentModel => ({ agent: agent.id, model: modelOf(agent.model) })

export const whereView = (subject: ExperimentSubject): WhereView => ({
  kind: subject.local ? "local" : "flow",
  name: subject.flow,
  range: subject.kind === "range" ? subject.range : null,
})

export const rowRole = (question: ExperimentQuestion, variant: Pick<ExperimentVariant, "id" | "role">): RowRole => {
  if (question.kind === "look") return "tested"
  if (question.kind !== "threshold") return variant.role
  if (question.variant === null || question.variant === variant.id) return "tested"
  return "other"
}

export const changeAt = (variant: Pick<ExperimentVariant, "changes">, node: NodeId): FactorChange | null =>
  variant.changes.find((change) => change.node === node) ?? null

const coversFactor = (factor: ExperimentFactor, changes: readonly FactorChange[]): boolean =>
  factor.nodes.every((node) => changes.some((change) => change.node === node))

export const variantValue = (factor: ExperimentFactor | null, variant: Pick<ExperimentVariant, "changes">): VariantValue => {
  const { changes } = variant
  const [first] = changes
  if (factor === null || first === undefined) return WRITTEN
  const values = new Set(changes.map((change) => change.value))
  if (values.size === 1 && coversFactor(factor, changes)) return { kind: "same", value: first.value }
  return { kind: "nodes", values: changes.map((change) => ({ node: change.node, value: change.value })) }
}

export const agentsOf = (variant: ExperimentVariant): readonly AgentModel[] =>
  [...new Map(variant.assignments.map((item) => [item.agent.id, agentModelOf(item.agent)] as const)).values()]

export const variantTable = (experiment: Subject): VariantTable => ({
  factor: experiment.varies,
  rows: experiment.variants.map((variant) => ({
    id: variant.id,
    role: rowRole(experiment.question, variant),
    value: variantValue(experiment.varies, variant),
    agents: agentsOf(variant),
  })),
})
