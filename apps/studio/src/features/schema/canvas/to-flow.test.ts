import { describe, expect, it } from "vitest"
import type { GroupNode, SchemaGraph } from "@/domain"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { schemaGraphs } from "@/mocks/data/schema"
import { findStage, fitViewOptions, groupFrame, groupTag, toFlowEdges, toFlowNodes, type ContainerFlowNode, type SchemaFlowNode, type StepFlowNode } from "./to-flow"

const pitchGraph = (): SchemaGraph => {
  const graph = schemaGraphs[workflowKey(WORKFLOWS.pitchPipeline)]
  if (graph === undefined) throw new Error("pitch pipeline graph is missing")
  return graph
}

const groupData = (data: Partial<GroupNode["data"]> & Pick<GroupNode["data"], "kind">): GroupNode["data"] => ({ fit: true, ...data })

const byType = (nodes: readonly SchemaFlowNode[], type: SchemaFlowNode["type"]): readonly SchemaFlowNode[] =>
  nodes.filter((node) => node.type === type)

const isStep = (node: SchemaFlowNode): node is StepFlowNode => node.type === "step"
const isContainer = (node: SchemaFlowNode): node is ContainerFlowNode => node.type === "container"

describe("toFlowNodes", () => {
  const nodes = toFlowNodes(pitchGraph().nodes)

  it("maps every canvas element of the pitch pipeline", () => {
    expect(byType(nodes, "step")).toHaveLength(32)
    expect(byType(nodes, "container")).toHaveLength(16)
    expect(byType(nodes, "gateway")).toHaveLength(4)
    expect(byType(nodes, "anchor")).toHaveLength(4)
  })

  it("lists parents before their children", () => {
    const seen = new Set<string>()
    const orphans = nodes.filter((node) => {
      seen.add(node.id)
      return node.parentId !== undefined && !seen.has(node.parentId)
    })
    expect(orphans).toEqual([])
  })

  it("sizes nodes inside the segment section as small", () => {
    const steps = nodes.filter(isStep)
    expect(steps.find((node) => node.id === "judge_facts_b2b")?.data.size).toBe("sm")
    expect(steps.find((node) => node.id === "judge_facts_b2b")).toMatchObject({ width: 220, height: 84 })
    expect(steps.find((node) => node.id === "pitch_gen_b")).toMatchObject({ width: 240, height: 92, selectable: true })
    expect(steps.find((node) => node.id === "render_hero")?.selectable).toBe(false)
    const containers = nodes.filter(isContainer)
    expect(containers.find((node) => node.id === "sec.segments")?.data.size).toBe("md")
    expect(containers.find((node) => node.id === "grp.panel_mice")?.data.size).toBe("sm")
  })

  it("derives container tags and frames", () => {
    const containers = nodes.filter(isContainer)
    const summary = Object.fromEntries(containers.map((node) => [node.id, `${node.data.tag}|${node.data.frame}`]))
    expect(summary["grp.score_map"]).toBe("MAP|tinted")
    expect(summary["grp.judge_panel"]).toBe("PARALLEL|outlined")
    expect(summary["grp.asset_render"]).toBe("PARALLEL ×3|dashed")
    expect(summary["sec.segments"]).toBe("STAGE 7|none")
    expect(summary["grp.loop_b2c"]).toBe("LOOP|tinted")
  })
})

describe("group presenters", () => {
  it("prefers the dashed frame over the kind frame", () => {
    expect(groupFrame(groupData({ kind: "parallel", dashed: true }))).toBe("dashed")
    expect(groupFrame(groupData({ kind: "switch" }))).toBe("tinted")
  })

  it("renders a bare section tag without a stage", () => {
    expect(groupTag(groupData({ kind: "section" }))).toBe("STAGE")
    expect(groupTag(groupData({ kind: "diverge", fanOut: 4 }))).toBe("DIVERGE ×4")
  })
})

describe("toFlowEdges", () => {
  const edges = toFlowEdges(pitchGraph().edges)

  it("maps the upper graph and the three segment branches", () => {
    expect(edges).toHaveLength(29 + 36)
    expect(edges.every((edge) => edge.type === "flow" && edge.selectable === false)).toBe(true)
  })

  it("carries labels and detours in edge data", () => {
    expect(edges.find((edge) => edge.id === "e27")?.data).toEqual({ variant: "flow", label: "needs_human" })
    expect(edges.find((edge) => edge.id === "e29")?.data).toEqual({ variant: "back", label: "back edge · repeat while score < 0.90", detourY: 880 })
    expect(edges.find((edge) => edge.id === "s12_mice")?.data).toEqual({ variant: "back", label: null, detourY: 2694 })
  })
})

describe("canvas viewport helpers", () => {
  it("fits only top-level nodes outside the segment section", () => {
    const ids = (fitViewOptions(pitchGraph().nodes).nodes ?? []).map((node) => node.id)
    expect(ids).toContain("grp.critic_loop")
    expect(ids).toContain("load_hotels")
    expect(ids).not.toContain("sec.segments")
    expect(ids).not.toContain("pitch_gen_b")
  })

  it("finds a stage by number", () => {
    expect(findStage(pitchGraph().stages, 5)?.title).toBe("5 · Critic loop")
    expect(findStage(pitchGraph().stages, null)).toBeNull()
    expect(findStage(pitchGraph().stages, 9)).toBeNull()
  })
})
