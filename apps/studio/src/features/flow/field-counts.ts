import type { ApiFlowSchemas } from "@/domain"
import { isJsonObject } from "@/features/nodes"
import type { CanvasGraph } from "./layout"

export type StepSchemas = { readonly in: unknown; readonly out: unknown }

export type FlowStepSchemas = Readonly<Record<string, StepSchemas>>

export const stepSchemas = (schemas: ApiFlowSchemas): FlowStepSchemas =>
  Object.fromEntries(Object.entries(schemas.nodes).map(([id, node]) => [id, { in: node.in ?? null, out: node.out ?? null }]))

const fieldCount = (schema: unknown): number | null => (isJsonObject(schema) && isJsonObject(schema.properties) ? Object.keys(schema.properties).length : null)

export const withFieldCounts = (graph: CanvasGraph, schemas: FlowStepSchemas): CanvasGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => {
    const fields = schemas[node.id]
    if (fields === undefined || node.role !== "step") return node
    return { ...node, inputs: fieldCount(fields.in) ?? node.inputs, outputs: fieldCount(fields.out) ?? node.outputs }
  }),
})
