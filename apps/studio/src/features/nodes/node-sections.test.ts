import { describe, expect, it } from "vitest"
import type { ApiNode, ApiNodeDetail } from "@/domain"
import { liveNodeDetails, liveNodePrompts, liveNodes } from "@/mocks/data/nodes"
import { nodeSections, type NodeSectionCopy } from "./node-sections"
import { childNodes } from "./node-tree"

const nodes: readonly ApiNode[] = liveNodes["support_case"] ?? []

const copy: NodeSectionCopy = { title: (id) => id, fact: (key) => key, graph: (key) => key }

const detailOf = (key: string): ApiNodeDetail => {
  const detail = liveNodeDetails[key]
  if (detail === undefined) throw new Error(`missing fixture detail ${key}`)
  return detail
}

const sectionIds = (key: string, promptKey: string | null): readonly string[] => {
  const detail = detailOf(key)
  const prompt = promptKey === null ? null : (liveNodePrompts[promptKey] ?? null)
  return nodeSections({ detail, prompt, children: childNodes(nodes, detail.node_id), copy }).map((section) => section.id)
}

describe("nodeSections", () => {
  it("gives a code node its facts, inputs, outputs and graph", () => {
    expect(sectionIds("support_case/prepare", null)).toEqual(["node-facts", "node-inputs", "node-outputs", "node-graph"])
  })

  it("gives an llm node the same sections once its prompt is loaded", () => {
    expect(sectionIds("support_case/triage", "support_case/triage")).toEqual([
      "node-facts",
      "node-inputs",
      "node-outputs",
      "node-graph",
    ])
  })

  it("drops the children section for a node that has none", () => {
    expect(sectionIds("support_case/approvals__lead", null)).not.toContain("node-children")
  })

  it("keeps the children section for a container node", () => {
    const detail = detailOf("support_case/prepare")
    const sections = nodeSections({ detail, prompt: null, children: childNodes(nodes, "drafts"), copy })
    expect(sections.map((section) => section.id)).toContain("node-children")
  })
})
