import { describe, expect, it } from "vitest"
import type { SchemaGraph, SchemaNode } from "@/domain"
import { WORKFLOW_IDS, workflowKey } from "@/mocks/data/keys"
import { inspections, schemaGraphs } from "@/mocks/data/schema"

const graphOf = (workflow: string): SchemaGraph => {
  const graph = schemaGraphs[workflowKey(workflow)]
  if (graph === undefined) throw new Error(`graph for ${workflow} is missing`)
  return graph
}

const flowYOf = (node: SchemaNode | undefined): number | undefined => (node?.type === "group" ? node.data.flowY : undefined)

const CONTAINER_HANDLES: ReadonlySet<string> = new Set(["in", "enter", "exit", "out"])

describe("schema mock backend", () => {
  it.each(WORKFLOW_IDS)("inspects every selectable node of %s", (workflow) => {
    const selectable = graphOf(workflow).nodes.filter((node) => node.type === "step" && node.data.inspectable)
    expect(selectable.length).toBeGreaterThan(0)
    const missing = selectable.filter((node) => inspections[workflowKey(workflow, node.id)]?.id !== node.id)
    expect(missing.map((node) => node.id)).toEqual([])
  })

  it.each(WORKFLOW_IDS)("connects edges of %s to existing nodes and handles", (workflow) => {
    const graph = graphOf(workflow)
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
    const broken = graph.edges.filter((edge) => {
      const endpoints = [
        { node: nodes.get(edge.source), handle: edge.sourceHandle },
        { node: nodes.get(edge.target), handle: edge.targetHandle },
      ]
      return endpoints.some(({ node, handle }) => node === undefined || (CONTAINER_HANDLES.has(handle) && node.type === "group" && flowYOf(node) === undefined))
    })
    expect(broken.map((edge) => edge.id)).toEqual([])
  })

  it.each(WORKFLOW_IDS)("numbers the stages of %s from one", (workflow) => {
    const stages = graphOf(workflow).stages
    expect(stages.map((stage) => stage.number)).toEqual(stages.map((_stage, index) => index + 1))
  })

  it("keeps the pitch_gen_b inspector values in line with the designed call", () => {
    const inspection = inspections[workflowKey(WORKFLOW_IDS[0], "pitch_gen_b")]
    expect(inspection?.config.map((row) => `${row.key}=${row.value}`)).toEqual([
      "temperature=0.9 · agent",
      "max_tokens=8192 · r42",
      "reasoning=medium",
      "seed=1337",
      "timeout=60 s",
      "retry=429 → backoff",
      "cost=$0.0611 · 4 attempts",
    ])
  })

  it("gives pitch variants their own identity in source", () => {
    const sources = ["pitch_gen_a", "pitch_gen_c", "pitch_gen_d"].map((id) => inspections[workflowKey(WORKFLOW_IDS[0], id)]?.source ?? "")
    expect(sources.map((source) => source.split("\n")[0])).toEqual(["- id: pitch_gen_a", "- id: pitch_gen_c", "- id: pitch_gen_d"])
    expect(sources[2]).not.toContain("fallback_profile")
  })
})
