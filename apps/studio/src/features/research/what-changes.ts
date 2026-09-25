import type { ExperimentDetail, FactorAgent, FactorKind, FactorSlot, FilePath, FlowId, NodeFile, NodeFileRole, NodeId, VariantId } from "@/domain"
import * as ids from "@/data/ids"
import type { GraphView } from "./graph-model"
import { factorValues, localNode, type FactorValue } from "./variant-table"

export type BlockKind = Exclude<FactorKind, "flow">

export type WrittenPrompt = { readonly nodes: readonly NodeId[]; readonly file: FilePath | null }

export type ChangeContent =
  | { readonly kind: "prompt"; readonly file: FilePath | null; readonly written: readonly WrittenPrompt[] }
  | { readonly kind: "use"; readonly description: string | null; readonly files: readonly NodeFile[] }
  | { readonly kind: "agent"; readonly agent: FactorAgent | null }

export type ChangeBlock = {
  readonly anchor: string
  readonly variant: VariantId
  readonly nodes: readonly NodeId[]
  readonly value: string | null
  readonly written: boolean
  readonly content: ChangeContent
}

export type FlowTarget = { readonly kind: "graph"; readonly key: string } | { readonly kind: "canvas"; readonly flow: FlowId }

export type ValueAction = FlowTarget | { readonly kind: "block"; readonly block: ChangeBlock } | { readonly kind: "none" }

export type PageAnchor =
  | { readonly kind: "change"; readonly variant: VariantId; readonly node: NodeId }
  | { readonly kind: "graph"; readonly key: string }
  | { readonly kind: "step"; readonly node: NodeId }

type Experiment = Pick<ExperimentDetail, "varies" | "variants" | "slots" | "agents" | "alternatives" | "prompts">

type ContentOf = (experiment: Experiment, value: FactorValue) => ChangeContent

const ANCHOR_JOIN = "-"
const CHANGE = "change"
const GRAPH = "graph"
const STEP = "step"
const PROMPT_ROLE: NodeFileRole = "prompt"
const NO_FILE = ""

const slotOf = (experiment: Pick<Experiment, "slots">, node: NodeId): FactorSlot | null => experiment.slots.find((slot) => slot.node === node) ?? null

const fileOf = (files: readonly NodeFile[], role: NodeFileRole): FilePath | null => files.find((file) => file.role === role)?.path ?? null

const writtenPrompt = (experiment: Pick<Experiment, "slots">, node: NodeId): FilePath | null => fileOf(slotOf(experiment, node)?.files ?? [], PROMPT_ROLE)

const NO_ACTION: ValueAction = { kind: "none" }

const firstNode = (value: FactorValue): NodeId => value.nodes[0] ?? ids.nodeId(NO_FILE)

export const writtenPrompts = (experiment: Pick<Experiment, "slots">, nodes: readonly NodeId[]): readonly WrittenPrompt[] => {
  const groups = new Map<string, WrittenPrompt>()
  for (const node of nodes) {
    const file = writtenPrompt(experiment, node)
    const key = file ?? NO_FILE
    groups.set(key, { nodes: [...(groups.get(key)?.nodes ?? []), node], file })
  }
  return [...groups.values()]
}

const promptContent: ContentOf = (experiment, value) => {
  if (value.written) return { kind: "prompt", file: writtenPrompt(experiment, firstNode(value)), written: [] }
  const file = experiment.prompts.find((prompt) => prompt.name === value.value)?.file ?? null
  return { kind: "prompt", file, written: writtenPrompts(experiment, value.nodes) }
}

const useContent: ContentOf = (experiment, value) => {
  if (value.written) return { kind: "use", description: null, files: slotOf(experiment, firstNode(value))?.files ?? [] }
  const alternative = experiment.alternatives.find((item) => item.id === value.value)
  return { kind: "use", description: alternative?.description ?? null, files: alternative?.files ?? [] }
}

const agentContent: ContentOf = (experiment, value) => ({ kind: "agent", agent: experiment.agents.find((agent) => agent.id === value.value) ?? null })

const CONTENT: Readonly<Record<BlockKind, ContentOf>> = {
  prompt: promptContent,
  use: useContent,
  agent: agentContent,
}

export const isBlockKind = (what: FactorKind): what is BlockKind => what !== "flow"

export const changeAnchor = (variant: VariantId, node: NodeId): string => [CHANGE, variant, node].join(ANCHOR_JOIN)

export const graphAnchor = (key: string): string => [GRAPH, key].join(ANCHOR_JOIN)

export const stepAnchor = (node: NodeId): string => [STEP, node].join(ANCHOR_JOIN)

export const valueAnchor = (variant: VariantId, value: FactorValue): string => changeAnchor(variant, firstNode(value))

export const changeBlocks = (experiment: Experiment): readonly ChangeBlock[] => {
  const factor = experiment.varies
  if (factor === null || !isBlockKind(factor.what)) return []
  const content = CONTENT[factor.what]
  return experiment.variants.flatMap((variant) =>
    factorValues(factor, experiment.slots, variant).map((value) => ({
      anchor: valueAnchor(variant.id, value),
      variant: variant.id,
      nodes: value.nodes,
      value: value.value,
      written: value.written,
      content: content(experiment, value),
    })),
  )
}

export const blockAt = (blocks: readonly ChangeBlock[], variant: VariantId, node: NodeId): ChangeBlock | null =>
  blocks.find((block) => block.variant === variant && block.nodes.includes(node)) ?? null

type AnchorParser = (parts: readonly string[]) => PageAnchor | null

const PARSERS: ReadonlyMap<string, AnchorParser> = new Map<string, AnchorParser>([
  [CHANGE, ([variant, node]) => (variant === undefined || node === undefined ? null : { kind: "change", variant: ids.variantId(variant), node: ids.nodeId(node) })],
  [GRAPH, ([key]) => (key === undefined ? null : { kind: "graph", key })],
  [STEP, ([node]) => (node === undefined ? null : { kind: "step", node: ids.nodeId(node) })],
])

export const parseAnchor = (hash: string): PageAnchor | null => {
  const [kind = NO_FILE, ...parts] = hash.split(ANCHOR_JOIN)
  const parse = PARSERS.get(kind)
  return parse === undefined ? null : parse(parts)
}

export const flowTarget = (views: readonly Pick<GraphView, "source">[], flow: string): FlowTarget => {
  const view = views.find((item) => item.source.flow === flow)
  if (view === undefined) return { kind: "canvas", flow: ids.flowId(flow) }
  return { kind: "graph", key: view.source.key }
}

export const subjectView = <T extends Pick<GraphView, "role">>(views: readonly T[]): T | null => views.find((view) => view.role === "subject") ?? null

export const slotStep = (views: readonly Pick<GraphView, "role" | "source">[], node: NodeId): { readonly graph: string; readonly node: string } | null => {
  const subject = subjectView(views)
  const found = subject?.source.nodes.find((item) => localNode(item.node_id) === node)
  if (subject === null || found === undefined) return null
  return { graph: subject.source.key, node: found.node_id }
}

export const valueAction = (
  what: FactorKind,
  views: readonly Pick<GraphView, "source">[],
  blocks: readonly ChangeBlock[],
  variant: VariantId,
  value: FactorValue,
): ValueAction => {
  if (value.value === null) return NO_ACTION
  if (what === "flow") return flowTarget(views, value.value)
  const block = blockAt(blocks, variant, firstNode(value))
  return block === null ? NO_ACTION : { kind: "block", block }
}
