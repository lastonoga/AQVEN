import type { AgentRef, ApiNode, ArmId, ArmStep, ExperimentDetail, ExperimentSubject, ExperimentVariant, NodeKind, NodeRange, VariantId } from "@/domain"
import type { CanvasGraph } from "@/features/flow"

export type SubjectGraph = {
  readonly key: string
  readonly arm: ArmId | null
  readonly nodes: readonly ApiNode[]
  readonly order: readonly string[]
}

export type GraphView = {
  readonly source: SubjectGraph
  readonly variants: readonly ExperimentVariant[]
  readonly dimmed: ReadonlySet<string>
  readonly swaps: ReadonlyMap<string, string>
}

export type NodeAgent = {
  readonly variant: VariantId
  readonly agent: string | null
  readonly model: string | null
  readonly overridden: boolean
}

export type NodeFacts = {
  readonly id: string
  readonly kind: NodeKind
  readonly description: string | null
  readonly outside: boolean
  readonly agents: readonly NodeAgent[]
}

type Fallback = { readonly agent: string | null; readonly model: string | null }

const NONE: ReadonlySet<string> = new Set()
const PAIR_JOIN = " → "
const MANY_JOIN = " · "
const PAIR = 2

const byNode = (nodes: readonly ApiNode[]): ReadonlyMap<string, ApiNode> => new Map(nodes.map((node) => [node.node_id, node]))

const rootOf = (nodes: ReadonlyMap<string, ApiNode>, id: string): string => {
  const parent = nodes.get(id)?.parent ?? null
  if (parent === null) return id
  return rootOf(nodes, parent)
}

const rootOrder = (graph: SubjectGraph): readonly string[] => {
  const roots = graph.nodes.filter((node) => node.parent === null).map((node) => node.node_id)
  return [...graph.order.filter((id) => roots.includes(id)), ...roots.filter((id) => !graph.order.includes(id))]
}

export const outsideRange = (graph: SubjectGraph, range: NodeRange | null): ReadonlySet<string> => {
  if (range === null) return NONE
  const nodes = byNode(graph.nodes)
  const order = rootOrder(graph)
  const from = order.indexOf(rootOf(nodes, range.from))
  const to = order.indexOf(rootOf(nodes, range.to))
  if (from < 0 || to < 0) return NONE
  const inside = new Set(order.slice(Math.min(from, to), Math.max(from, to) + 1))
  return new Set(graph.nodes.map((node) => node.node_id).filter((id) => !inside.has(rootOf(nodes, id))))
}

const rangeOf = (experiment: Pick<ExperimentDetail, "subject">, graph: SubjectGraph): NodeRange | null => {
  const { subject } = experiment
  if (subject.kind === "range") return subject.range
  if (subject.kind === "arm" && subject.arm === graph.arm) return subject.range
  return null
}

const subjectArm = (subject: ExperimentSubject): ArmId | null => (subject.kind === "arm" ? subject.arm : null)

export const variantsOn = (experiment: Pick<ExperimentDetail, "subject" | "variants">, arm: ArmId | null): readonly ExperimentVariant[] =>
  experiment.variants.filter((variant) => (variant.arm ?? subjectArm(experiment.subject)) === arm)

const stepOf = (experiment: Pick<ExperimentDetail, "arms">, arm: ArmId | null, node: string): ArmStep | null =>
  experiment.arms.find((item) => item.id === arm)?.steps.find((step) => step.node === node) ?? null

const agentText = (agent: AgentRef | null): Fallback => ({ agent: agent?.id ?? null, model: agent?.model ?? null })

const fallbackOf = (experiment: Pick<ExperimentDetail, "arms">, graph: SubjectGraph, node: ApiNode): Fallback => {
  const step = stepOf(experiment, graph.arm, node.node_id)
  if (step !== null) return agentText(step.agent)
  return { agent: node.agent, model: null }
}

export const nodeAgents = (variants: readonly ExperimentVariant[], node: string, fallback: Fallback): readonly NodeAgent[] =>
  variants.map((variant) => {
    const assignment = variant.assignments.find((item) => item.node === node)
    if (assignment === undefined) return { variant: variant.id, ...fallback, overridden: false }
    return { variant: variant.id, agent: assignment.agent.id, model: assignment.agent.model, overridden: assignment.overridden }
  })

export const swapText = (agents: readonly NodeAgent[]): string | null => {
  const distinct = [...new Set(agents.map((item) => item.agent).filter((agent): agent is string => agent !== null))]
  if (distinct.length < PAIR) return null
  return distinct.join(distinct.length === PAIR ? PAIR_JOIN : MANY_JOIN)
}

const swapsOf = (experiment: Pick<ExperimentDetail, "arms">, graph: SubjectGraph, variants: readonly ExperimentVariant[]): ReadonlyMap<string, string> =>
  new Map(
    graph.nodes.flatMap((node) => {
      const swap = swapText(nodeAgents(variants, node.node_id, fallbackOf(experiment, graph, node)))
      return swap === null ? [] : [[node.node_id, swap] as const]
    }),
  )

export const graphViews = (experiment: Pick<ExperimentDetail, "subject" | "arms" | "variants">, graphs: readonly SubjectGraph[]): readonly GraphView[] =>
  graphs.map((source) => {
    const variants = variantsOn(experiment, source.arm)
    return { source, variants, dimmed: outsideRange(source, rangeOf(experiment, source)), swaps: swapsOf(experiment, source, variants) }
  })

export const markSwaps = (graph: CanvasGraph, swaps: ReadonlyMap<string, string>, label: (agents: string) => string): CanvasGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => {
    const swap = swaps.get(node.id)
    if (swap === undefined || node.role !== "step") return node
    return { ...node, meta: label(swap) }
  }),
})

export const nodeFacts = (experiment: Pick<ExperimentDetail, "arms">, view: GraphView, id: string): NodeFacts | null => {
  const node = byNode(view.source.nodes).get(id)
  if (node === undefined) return null
  return {
    id,
    kind: node.kind,
    description: stepOf(experiment, view.source.arm, id)?.description ?? null,
    outside: view.dimmed.has(id),
    agents: nodeAgents(view.variants, id, fallbackOf(experiment, view.source, node)),
  }
}
