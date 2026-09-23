import { describe, expect, it } from "vitest"
import type { ApiExecution, ApiJsonValue, ApiRunSnapshot } from "@/domain"
import { caseNameOf, caseYaml, draftCase, toCasesPrompt } from "./case-draft"
import { completedSnapshot, execution } from "./test-support"

const RUN_ID = "01a0b104-4658-70aa-b49b-7c2586b56d92"

const output = (nodeId: string, value: ApiJsonValue, patch: Partial<ApiExecution> = {}): ApiExecution =>
  execution(nodeId, { output_ref: { kind: "inline", value }, ...patch })

const snapshot = (patch: Partial<ApiRunSnapshot>): ApiRunSnapshot => ({ ...completedSnapshot(), run_id: RUN_ID, ...patch })

describe("draftCase", () => {
  it("takes the run input, the set context and the outputs of finished top-level nodes", () => {
    const draft = draftCase(snapshot({
      order: ["prepare", "triage", "drafts"],
      input_ref: { kind: "inline", value: { message: "lamp flickers", urgent: true } },
      context: { date: "2026-09-17", time_zone: null, locale: null, tenant_id: "lumen" },
      node_outputs: {},
      executions: [
        output("prepare", { customer_id: "cus_1" }),
        output("triage", { intent: "defect" }, { status: "failed" }),
        output("drafts__gpt", { text: "nested" }, { address: { node_id: "drafts__gpt", branch_key: "gpt", iteration: null, item_index: null } }),
      ],
    }), [])
    expect(draft).toEqual({
      name: "run_b56d92",
      inputs: { message: "lamp flickers", urgent: true },
      context: { date: "2026-09-17", tenant_id: "lumen" },
      nodeOutputs: { prepare: { customer_id: "cus_1" } },
      tags: { source_run: RUN_ID },
    })
  })

  it("omits empty context and node outputs", () => {
    const draft = draftCase(snapshot({ input_ref: null, context: null, node_outputs: {}, executions: [] }), [])
    expect(draft.inputs).toBeNull()
    expect(draft.context).toBeNull()
    expect(draft.nodeOutputs).toBeNull()
  })

  it("names the case after the run reference", () => {
    expect(caseNameOf(RUN_ID)).toBe("run_b56d92")
  })
})

describe("caseYaml", () => {
  it("writes block YAML with double-quoted strings like the canonical writer", () => {
    const yaml = caseYaml({
      name: "run_b56d92",
      inputs: { message: "line one\nline \"two\"", tags: ["flicker", "hot"], count: 2, photo: null, nested: [{ id: "a" }], empty: [] },
      context: { tenant_id: "lumen" },
      nodeOutputs: { "prepare": { ok: true } },
      tags: { source_run: RUN_ID },
    })
    expect(yaml).toBe([
      "cases:",
      "- name: \"run_b56d92\"",
      "  inputs:",
      "    message: \"line one\\nline \\\"two\\\"\"",
      "    tags:",
      "    - \"flicker\"",
      "    - \"hot\"",
      "    count: 2",
      "    photo: null",
      "    nested:",
      "    - id: \"a\"",
      "    empty: []",
      "  context:",
      "    tenant_id: \"lumen\"",
      "  node_outputs:",
      "    prepare:",
      "      ok: true",
      "  tags:",
      `    source_run: "${RUN_ID}"`,
    ].join("\n"))
  })

  it("quotes keys that are not plain names", () => {
    expect(caseYaml({ name: "c", inputs: { "a b": 1 }, context: null, nodeOutputs: null, tags: {} })).toContain("    \"a b\": 1")
  })
})

describe("toCasesPrompt", () => {
  it("targets the dataset the run came from", () => {
    const prompt = toCasesPrompt({ flowId: "support_case", runId: RUN_ID, item: { datasetId: "support_case_cases", caseName: "strip" } }, "cases:")
    expect(prompt).toContain(`Turn run ${RUN_ID} of flow support_case into a dataset case.`)
    expect(prompt).toContain("datasets/support_case_cases.yaml")
    expect(prompt).toContain("```yaml\ncases:\n```")
  })

  it("asks for a dataset of the flow when the run did not come from a case", () => {
    const prompt = toCasesPrompt({ flowId: "support_case", runId: RUN_ID, item: null }, "cases:")
    expect(prompt).toContain("datasets/support_case_cases.yaml with apiVersion")
  })
})
