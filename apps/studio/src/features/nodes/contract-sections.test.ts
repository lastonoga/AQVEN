import { describe, expect, it } from "vitest"
import type { NodeContract } from "@/domain"
import { nodeId } from "@/data/ids"
import { contractSections, PANEL_SECTIONS, REFERENCE_SECTIONS, type ContractCopy } from "./contract-sections"

const copy: ContractCopy = {
  title: (section) => `${section}.title`,
  hint: (section) => `${section}.hint`,
  none: (section) => `${section}.none`,
}

const tool: NodeContract = {
  id: nodeId("load_hotels"),
  kind: "tool",
  stage: 1,
  context: ["data load"],
  signature: null,
  profile: null,
  bindings: [],
  writesSource: "writes: none",
  checks: [],
  generatedSource: "- id: load_hotels\n  adapter: hotels.search   # read",
}

const llm: NodeContract = {
  ...tool,
  signature: { ref: { id: "write_pitch", version: "v7" }, source: "write_pitch:" },
  profile: { ref: { id: "pitch_writer", model: "gpt-5.1" }, source: "provider: openai" },
}

describe("contract sections", () => {
  it("builds labelled sections in order with prefixed ids", () => {
    const sections = contractSections([...REFERENCE_SECTIONS, ...PANEL_SECTIONS], llm, copy)
    expect(sections.map((section) => section.id)).toEqual([
      "contract-signature",
      "contract-profile",
      "contract-bindings",
      "contract-writes",
      "contract-code",
    ])
    expect(sections[0]?.title).toBe("signature.title")
    expect(sections[4]?.hint).toBe("code.hint")
  })

  it("renders the generated code as a code text body with comment runs", () => {
    const [code] = contractSections(["code"], tool, copy)
    expect(code?.body).toEqual({
      kind: "text",
      lines: [["- id: load_hotels"], ["  adapter: hotels.search   ", { text: "# read", mark: "comment" }]],
    })
  })

  it("falls back to a plain none line when a node has no signature or profile", () => {
    const sections = contractSections(REFERENCE_SECTIONS, tool, copy)
    expect(sections.map((section) => section.body)).toEqual([
      { kind: "text", lines: [["signature.none"]], variant: "plain" },
      { kind: "text", lines: [["profile.none"]], variant: "plain" },
    ])
  })

  it("describes references, bindings and writes as data bodies", () => {
    const sections = contractSections(["signature", "profile", "bindings", "writes"], llm, copy)
    expect(sections.map((section) => section.body.kind)).toEqual(["reference", "reference", "bindings", "writes"])
  })
})
