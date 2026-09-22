import { describe, expect, it } from "vitest"
import { liveNodeDetails, liveNodePrompts } from "@/mocks/data/nodes"
import { livePrompts } from "@/mocks/data/project"
import { bindingOrigin, bindingRows, outputRows, producerId, promptGroups, resolution } from "./presenters"

const triage = liveNodeDetails["support_case/triage"]
const prepare = liveNodeDetails["support_case/prepare"]
const triagePrompt = liveNodePrompts["support_case/triage"] ?? null

const rowsOf = (detail: typeof triage, prompt: typeof triagePrompt) => (detail === undefined ? [] : bindingRows(detail, prompt))

describe("bindingOrigin", () => {
  it("reads the origin off every reference prefix the project uses", () => {
    expect(bindingOrigin("$input.customer", null)).toBe("input")
    expect(bindingOrigin("$prepare.out.message", null)).toBe("node")
    expect(bindingOrigin("$run.context.tenant_id", null)).toBe("run")
    expect(bindingOrigin("$iter.extract.out.record", null)).toBe("iter")
    expect(bindingOrigin("$ok[*].reply", null)).toBe("branch")
  })

  it("separates a literal value from an unbound slot", () => {
    expect(bindingOrigin(null, "cheap")).toBe("literal")
    expect(bindingOrigin(null, null)).toBe("unbound")
  })

  it("names the producing node of a node reference", () => {
    expect(producerId("$prepare.out.message")).toBe("prepare")
    expect(producerId("$input.customer")).toBeNull()
  })
})

describe("bindingRows", () => {
  it("resolves every slot type of the recorded llm node from its prompt", () => {
    const rows = rowsOf(triage, triagePrompt)
    expect(rows).toHaveLength(10)
    expect(rows.map((row) => row.typeLabel)).toEqual([
      "Text",
      "Channel",
      "Customer",
      "ProductRef?",
      "SignalDef[]",
      "FieldSpec[]",
      "Image?",
      "Audio?",
      "Video?",
      "Document?",
    ])
  })

  it("resolves a code node slot type from its declared input", () => {
    const rows = rowsOf(prepare, null)
    expect(rows).toEqual([{ slot: "request", typeLabel: "CaseRequest", origin: "input", source: "$input", required: true }])
  })

  it("counts bound slots", () => {
    expect(resolution(rowsOf(triage, triagePrompt))).toEqual({ bound: 10, total: 10, tone: "success" })
  })
})

describe("outputRows", () => {
  it("marks the run-time shaped output of the recorded llm node", () => {
    const rows = triage === undefined ? [] : outputRows(triage)
    expect(rows.find((row) => row.name === "intake_extra")?.dynamic).toBe(true)
    expect(rows.find((row) => row.name === "summary")?.dynamic).toBe(false)
  })

  it("prefers the declared outputs of a code node", () => {
    const rows = prepare === undefined ? [] : outputRows(prepare)
    expect(rows.map((row) => row.typeLabel)).toContain("SignalDef[]")
  })
})

describe("promptGroups", () => {
  it("collapses the nodes that share one prompt file into a single entry", () => {
    const groups = promptGroups(livePrompts.filter((prompt) => prompt.flow_id === "support_case"))
    const revise = groups.find((group) => group.key === "flows/support_case/nodes/polish/revise.prompt.md")
    expect(revise?.label).toBe("revise")
    expect(revise?.nodeIds).toHaveLength(4)
    expect(revise?.level).toBe(2)
  })

  it("keeps a code-built prompt under its builder reference", () => {
    const groups = promptGroups([
      {
        flow_id: "support_case",
        node_id: "illustrate",
        inference_id: "illustrate",
        level: 3,
        path: null,
        file_hash: null,
        builder_ref: "@root/flows/support_case/nodes/illustrate/illustrate.py:illustrate_prompt",
        has_draft: false,
        draft_stale: false,
        problems_count: 0,
      },
    ])
    expect(groups.map((group) => group.label)).toEqual(["illustrate_prompt"])
  })
})
