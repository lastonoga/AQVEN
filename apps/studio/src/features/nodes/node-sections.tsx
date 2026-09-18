import type { ApiNode, ApiNodeDetail, ApiPromptDetail } from "@/domain"
import type { PropertyRow, SectionSpec } from "@/components/studio"
import { BindingsBody, LabelledNodeLinks, NodeLinkRow, OutputsBody } from "./node-bodies"
import { nodeFacts, type FactKey } from "./node-facts"
import { bindingRows, outputRows } from "./presenters"

export const DEFINITION_SECTIONS = ["facts", "inputs", "outputs", "children", "graph"] as const

export type NodeSectionId = (typeof DEFINITION_SECTIONS)[number]

export type GraphKey = "upstream" | "downstream"

export type NodeSectionCopy = {
  readonly title: (id: NodeSectionId) => string
  readonly fact: (key: FactKey) => string
  readonly graph: (key: GraphKey) => string
}

export type NodeSectionContext = {
  readonly detail: ApiNodeDetail
  readonly prompt: ApiPromptDetail | null
  readonly children: readonly ApiNode[]
  readonly copy: NodeSectionCopy
}

type NodeSectionBuilder = (context: NodeSectionContext) => SectionSpec | null

const section = (id: NodeSectionId, copy: NodeSectionCopy, body: SectionSpec["body"]): SectionSpec => ({
  id: `node-${id}`,
  title: copy.title(id),
  body,
})

const factsSection: NodeSectionBuilder = ({ detail, copy }) => {
  const facts = nodeFacts(detail.spec)
  if (facts.length === 0) return null
  const rows = facts.map((fact): PropertyRow => ({ key: copy.fact(fact.key), value: { text: fact.text, mono: fact.mono } }))
  return section("facts", copy, { kind: "properties", rows })
}

const inputsSection: NodeSectionBuilder = ({ detail, prompt, copy }) => {
  const rows = bindingRows(detail, prompt)
  if (rows.length === 0) return null
  return section("inputs", copy, { kind: "node", node: <BindingsBody rows={rows} /> })
}

const outputsSection: NodeSectionBuilder = ({ detail, copy }) => {
  const rows = outputRows(detail)
  if (rows.length === 0) return null
  return section("outputs", copy, { kind: "node", node: <OutputsBody rows={rows} /> })
}

const childrenSection: NodeSectionBuilder = ({ children, copy }) => {
  if (children.length === 0) return null
  return section("children", copy, { kind: "node", node: <NodeLinkRow nodes={children} /> })
}

const graphSection: NodeSectionBuilder = ({ detail, copy }) => {
  if (detail.upstream.length === 0 && detail.downstream.length === 0) return null
  return section("graph", copy, {
    kind: "node",
    node: (
      <div className="flex flex-col gap-2.5">
        <LabelledNodeLinks label={copy.graph("upstream")} nodeIds={detail.upstream} />
        <LabelledNodeLinks label={copy.graph("downstream")} nodeIds={detail.downstream} />
      </div>
    ),
  })
}

const NODE_SECTION: Readonly<Record<NodeSectionId, NodeSectionBuilder>> = {
  facts: factsSection,
  inputs: inputsSection,
  outputs: outputsSection,
  children: childrenSection,
  graph: graphSection,
}

export const nodeSections = (context: NodeSectionContext): readonly SectionSpec[] =>
  DEFINITION_SECTIONS.flatMap((id) => {
    const spec = NODE_SECTION[id](context)
    return spec === null ? [] : [spec]
  })
