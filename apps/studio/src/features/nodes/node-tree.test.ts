import { describe, expect, it } from "vitest"
import type { ApiNode } from "@/domain"
import { liveNodes } from "@/mocks/data/nodes"
import { childNodes, fileStem, functionName, nodeSubtitle, nodeTree } from "./node-tree"

const supportCase: readonly ApiNode[] = liveNodes["support_case"] ?? []

const byId = (nodeId: string): ApiNode => {
  const node = supportCase.find((candidate) => candidate.node_id === nodeId)
  if (node === undefined) throw new Error(`missing fixture node ${nodeId}`)
  return node
}

describe("nodeTree", () => {
  it("keeps the endpoint order and derives depth from the parent chain", () => {
    const rows = nodeTree(supportCase)
    expect(rows.map((row) => row.node.node_id)).toEqual(supportCase.map((node) => node.node_id))
    const depths = new Map(rows.map((row) => [row.node.node_id, row.depth]))
    expect(depths.get("drafts")).toBe(0)
    expect(depths.get("drafts__gemini")).toBe(1)
    expect(depths.get("vote__ballot")).toBe(1)
  })

  it("puts every root node at depth zero and every child one below its parent", () => {
    const rows = nodeTree(supportCase)
    const depths = new Map(rows.map((row) => [row.node.node_id, row.depth]))
    const roots = rows.filter((row) => row.node.parent === null)
    expect(roots.every((row) => row.depth === 0)).toBe(true)
    expect(rows.filter((row) => row.node.parent !== null).every((row) => row.depth === (depths.get(row.node.parent ?? "") ?? -1) + 1)).toBe(true)
  })

  it("lists the children of a container node", () => {
    expect(childNodes(supportCase, "drafts").map((node) => node.local_id)).toEqual(["gemini", "gpt", "mistral"])
    expect(childNodes(supportCase, "prepare")).toEqual([])
  })
})

describe("nodeSubtitle", () => {
  it("names the agent and inference of an llm node", () => {
    expect(nodeSubtitle(byId("triage"))).toBe("gemini · triage")
  })

  it("names the function of a code node", () => {
    expect(nodeSubtitle(byId("prepare"))).toBe("prepare")
  })

  it("stays empty for a container node", () => {
    expect(nodeSubtitle(byId("drafts"))).toBeNull()
  })
})

describe("path helpers", () => {
  it("takes the stem of a file path", () => {
    expect(fileStem("agents/resolver/resolver.yaml")).toBe("resolver")
    expect(fileStem("agents/resolver/research_policy.inference.yaml")).toBe("research_policy")
  })

  it("takes the function of a code reference", () => {
    expect(functionName("@root/flows/support_case/nodes/prepare/prepare.py:prepare")).toBe("prepare")
  })
})
