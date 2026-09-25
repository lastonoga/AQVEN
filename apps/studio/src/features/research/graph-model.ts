import type { AgentRef, ApiNode, ApiPromptDetail, ExperimentDetail, ExperimentVariant, FactorKind, FlowId, FlowStep, NodeKind, NodeRange, VariantId } from "@/domain"
import type { CanvasGraph, FlowStepSchemas, StepSchemas } from "@/features/flow"
import { changeAt, localNode } from "./variant-table"

export type PromptSource =
  | { readonly kind: "flow"; readonly flow: FlowId }
  | { readonly kind: "local"; readonly prompts: Readonly<Record<string, ApiPromptDetail>> }

export type SubjectGraph = {
  readonly key: string
  readonly flow: FlowId
  readonly local: boolean
  readonly nodes: readonly ApiNode[]
  readonly order: readonly string[]
  readonly schemas: FlowStepSchemas
  readonly prompts: PromptSource
}

export type GraphRole = "subject" | "called"

export type StepMark =
  | { readonly kind: "swap"; readonly agents: string }
  | { readonly kind: "factor"; readonly what: FactorKind; readonly values: readonly string[] }

export type GraphView = {
  readonly source: SubjectGraph
  readonly role: GraphRole
  readonly variants: readonly ExperimentVariant[]
  readonly dimmed: ReadonlySet<string>
  readonly marks: ReadonlyMap<string, StepMark>
}

type Experiment = Pick<ExperimentDetail, "subject" | "varies" | "flows" | "variants">

export type NodeAgent = {
  readonly variant: VariantId
  readonly agent: string | null
  readonly model: string | null
  readonly overridden: boolean
}

export type StepPrompt =
  | { readonly kind: "none" }
  | { readonly kind: "ready"; readonly prompt: ApiPromptDetail }
  | { readonly kind: "remote"; readonly flow: FlowId; readonly node: string }

export type StepDescription =
  | { readonly kind: "ready"; readonly text: string | null }
  | { readonly kind: "remote"; readonly flow: FlowId; readonly node: string }

export type NodeFacts = {
  readonly id: string
  readonly kind: NodeKind
  readonly description: StepDescription
  readonly outside: boolean
  readonly agents: readonly NodeAgent[]
  readonly schemas: StepSchemas | null
  readonly prompt: StepPrompt
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

const isSubject = (experiment: Pick<ExperimentDetail, "subject">, graph: SubjectGraph): boolean => experiment.subject.flow === graph.flow

const rangeOf = (experiment: Pick<ExperimentDetail, "subject">, graph: SubjectGraph): NodeRange | null => {
  const { subject } = experiment
  if (subject.kind !== "range" || !isSubject(experiment, graph)) return null
  return subject.range
}

const callsFlow = (variant: ExperimentVariant, flow: FlowId): boolean => variant.changes.some((change) => change.what === "flow" && change.value === flow)

export const variantsOn = (experiment: Experiment, graph: SubjectGraph): readonly ExperimentVariant[] => {
  if (isSubject(experiment, graph)) return experiment.variants
  return experiment.variants.filter((variant) => callsFlow(variant, graph.flow))
}

const stepOf = (experiment: Pick<ExperimentDetail, "flows">, graph: SubjectGraph, node: string): FlowStep | null => {
  if (!graph.local) return null
  return experiment.flows.find((item) => item.id === graph.flow)?.steps.find((step) => step.node === node) ?? null
}

const agentText = (agent: AgentRef | null): Fallback => ({ agent: agent?.id ?? null, model: agent?.model ?? null })

const fallbackOf = (experiment: Pick<ExperimentDetail, "flows">, graph: SubjectGraph, node: ApiNode): Fallback => {
  const step = stepOf(experiment, graph, node.node_id)
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

const swapMark = (experiment: Experiment, graph: SubjectGraph, variants: readonly ExperimentVariant[], node: ApiNode): StepMark | null => {
  const agents = swapText(nodeAgents(variants, node.node_id, fallbackOf(experiment, graph, node)))
  return agents === null ? null : { kind: "swap", agents }
}

const factorMark = (experiment: Experiment, graph: SubjectGraph, node: ApiNode): StepMark | null => {
  const factor = experiment.varies
  if (factor === null || !isSubject(experiment, graph)) return null
  const local = localNode(node.node_id)
  if (!factor.nodes.includes(local)) return null
  const values = [...new Set(experiment.variants.flatMap((variant) => changeAt(variant, local)?.value ?? []))]
  return { kind: "factor", what: factor.what, values }
}

const marksOf = (experiment: Experiment, graph: SubjectGraph, variants: readonly ExperimentVariant[]): ReadonlyMap<string, StepMark> =>
  new Map(
    graph.nodes.flatMap((node) => {
      const mark = swapMark(experiment, graph, variants, node) ?? factorMark(experiment, graph, node)
      return mark === null ? [] : [[node.node_id, mark] as const]
    }),
  )

export const graphViews = (experiment: Experiment, graphs: readonly SubjectGraph[]): readonly GraphView[] =>
  graphs.map((source) => {
    const variants = variantsOn(experiment, source)
    return {
      source,
      role: isSubject(experiment, source) ? "subject" : "called",
      variants,
      dimmed: outsideRange(source, rangeOf(experiment, source)),
      marks: marksOf(experiment, source, variants),
    }
  })

export const markSteps = (graph: CanvasGraph, marks: ReadonlyMap<string, StepMark>, label: (mark: StepMark) => string): CanvasGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => {
    const mark = marks.get(node.id)
    if (mark === undefined || node.role !== "step") return node
    return { ...node, meta: label(mark) }
  }),
})

const NO_PROMPT: StepPrompt = { kind: "none" }

const localPrompt = (prompts: Readonly<Record<string, ApiPromptDetail>>, node: string): StepPrompt => {
  const prompt = prompts[node]
  return prompt === undefined ? NO_PROMPT : { kind: "ready", prompt }
}

const promptOf = (source: PromptSource, node: ApiNode): StepPrompt => {
  if (node.inference === null) return NO_PROMPT
  if (source.kind === "local") return localPrompt(source.prompts, node.node_id)
  return { kind: "remote", flow: source.flow, node: node.node_id }
}

const descriptionOf = (experiment: Pick<ExperimentDetail, "flows">, source: SubjectGraph, node: string): StepDescription => {
  if (source.prompts.kind === "flow") return { kind: "remote", flow: source.prompts.flow, node }
  return { kind: "ready", text: stepOf(experiment, source, node)?.description ?? null }
}

export const nodeFacts = (experiment: Pick<ExperimentDetail, "flows">, view: GraphView, id: string): NodeFacts | null => {
  const node = byNode(view.source.nodes).get(id)
  if (node === undefined) return null
  return {
    id,
    kind: node.kind,
    description: descriptionOf(experiment, view.source, id),
    outside: view.dimmed.has(id),
    agents: nodeAgents(view.variants, id, fallbackOf(experiment, view.source, node)),
    schemas: view.source.schemas[id] ?? null,
    prompt: promptOf(view.source.prompts, node),
  }
}

export type StepSelection = { readonly graph: string; readonly node: string }

export const selectedFacts = (experiment: Pick<ExperimentDetail, "flows">, views: readonly GraphView[], selection: StepSelection | null): NodeFacts | null => {
  if (selection === null) return null
  const view = views.find((item) => item.source.key === selection.graph)
  if (view === undefined) return null
  return nodeFacts(experiment, view, selection.node)
}
