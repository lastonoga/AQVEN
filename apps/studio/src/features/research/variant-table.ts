import type {
  AgentRef,
  ExperimentDetail,
  ExperimentFactor,
  ExperimentQuestion,
  ExperimentSubject,
  ExperimentVariant,
  FactorChange,
  FactorSlot,
  NodeId,
  NodeRange,
  VariantId,
  VariantRole,
} from "@/domain"
import * as ids from "@/data/ids"

export type RowRole = VariantRole | "tested"

export type Named = { readonly short: string; readonly full: string }

export type AgentModel = { readonly agent: string; readonly model: Named }

export type FactorValue = { readonly nodes: readonly NodeId[]; readonly value: string | null; readonly written: boolean }

export type VariantRow = {
  readonly id: VariantId
  readonly role: RowRole
  readonly values: readonly FactorValue[]
  readonly agents: readonly AgentModel[]
}

export type VariantTable = { readonly factor: ExperimentFactor | null; readonly rows: readonly VariantRow[]; readonly models: boolean }

export type WhereKind = "flow" | "local"

export type WhereView = { readonly kind: WhereKind; readonly name: string; readonly range: NodeRange | null }

type Subject = Pick<ExperimentDetail, "varies" | "variants" | "question" | "slots">

type NodeValue = { readonly node: NodeId; readonly value: string | null; readonly written: boolean }

const PROVIDER_MARK = ":"
const VENDOR_MARK = "/"
const NESTING_MARK = "__"
const STEP_JOIN = " › "
const NODE_JOIN = ", "
const KEY_JOIN = "\u001f"

export const shortModel = (model: string): string => {
  const bare = model.slice(model.indexOf(PROVIDER_MARK) + 1)
  return bare.slice(bare.lastIndexOf(VENDOR_MARK) + 1)
}

export const stepName = (node: string): string => node.split(NESTING_MARK).join(STEP_JOIN)

export const nodesText = (nodes: readonly string[]): string => nodes.map(stepName).join(NODE_JOIN)

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

export const writtenAt = (slots: readonly FactorSlot[], node: NodeId): string | null => slots.find((slot) => slot.node === node)?.written ?? null

const nodeValue = (slots: readonly FactorSlot[], variant: Pick<ExperimentVariant, "changes">, node: NodeId): NodeValue => {
  const change = changeAt(variant, node)
  if (change === null) return { node, value: writtenAt(slots, node), written: true }
  return { node, value: change.value, written: false }
}

const valueKey = (value: NodeValue): string => [String(value.written), value.value ?? ""].join(KEY_JOIN)

const grouped = (values: readonly NodeValue[]): readonly FactorValue[] => {
  const groups = new Map<string, FactorValue>()
  for (const item of values) {
    const key = valueKey(item)
    const group = groups.get(key)
    groups.set(key, { nodes: [...(group?.nodes ?? []), item.node], value: item.value, written: item.written })
  }
  return [...groups.values()]
}

export const factorValues = (factor: ExperimentFactor | null, slots: readonly FactorSlot[], variant: Pick<ExperimentVariant, "changes">): readonly FactorValue[] => {
  if (factor === null) return []
  return grouped(factor.nodes.map((node) => nodeValue(slots, variant, node)))
}

export const agentsOf = (variant: ExperimentVariant): readonly AgentModel[] =>
  [...new Map(variant.assignments.map((item) => [item.agent.id, agentModelOf(item.agent)] as const)).values()]

export const variantTable = (experiment: Subject): VariantTable => {
  const rows = experiment.variants.map((variant) => ({
    id: variant.id,
    role: rowRole(experiment.question, variant),
    values: factorValues(experiment.varies, experiment.slots, variant),
    agents: agentsOf(variant),
  }))
  return { factor: experiment.varies, rows, models: rows.some((row) => row.agents.length > 0) }
}
