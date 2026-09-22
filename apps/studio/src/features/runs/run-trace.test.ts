import { describe, expect, it } from "vitest"
import type { ApiFlowSchemas } from "@/domain"
import { liveExecutionDetails } from "@/mocks/data/runs"
import { callDetail } from "./run-trace"

const execution = Object.values(liveExecutionDetails).find((item) => item.address.node_id === "triage")

const schemas: ApiFlowSchemas = {
  flow_id: "support_case",
  input: null,
  output: null,
  context: [],
  nodes: {
    triage: {
      in: { type: "object", properties: { message: { type: "string" } } },
      out: { type: "object", properties: { summary: { type: "string" } } },
    },
  },
}

describe("callDetail schemas", () => {
  it("uses current node schemas when the old run plan cannot be loaded", () => {
    if (execution === undefined) throw new Error("missing triage execution")
    const detail = callDetail(execution, null, {}, [], schemas)
    expect(detail.inputSchema).toEqual({ schema: schemas.nodes["triage"]?.in, source: "current" })
    expect(detail.outputSchema).toEqual({ schema: schemas.nodes["triage"]?.out, source: "current" })
  })

  it("keeps the schema recorded with the run ahead of the current flow", () => {
    if (execution === undefined) throw new Error("missing triage execution")
    const recorded = { type: "object", properties: { original: { type: "integer" } } }
    const detail = callDetail({ ...execution, input_schema: recorded, output_schema: recorded, schema_source: "run" }, null, {}, [], schemas)
    expect(detail.inputSchema).toEqual({ schema: recorded, source: "run" })
    expect(detail.outputSchema).toEqual({ schema: recorded, source: "run" })
  })

})
