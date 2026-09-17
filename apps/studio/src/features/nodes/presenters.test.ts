import { describe, expect, it } from "vitest"
import type { Binding, NodeContract, NodeSummary, RegistryEntry } from "@/domain"
import { nodeId, registryEntryId, revisionId } from "@/data/ids"
import { REGISTRY_KIND, REGISTRY_KINDS } from "./presets"
import {
  contractMeta,
  inputLabel,
  nodeMeta,
  profileReference,
  registryTrailing,
  resolution,
  revisionLabel,
  signatureReference,
  typeLabel,
} from "./presenters"

const stage = (value: number): string => `stage ${String(value)}`

const binding = (input: string, patch: Partial<Binding> = {}): Binding => ({
  input,
  type: "string",
  optional: false,
  source: "literal",
  resolver: "“family”",
  lastRun: '"family"',
  resolved: true,
  ...patch,
})

const contract: NodeContract = {
  id: nodeId("pitch_gen_b"),
  kind: "llm",
  stage: 4,
  context: ["divergence branch b", "wrapped by diverge ×4"],
  signature: { ref: { id: "write_pitch", version: "v7", revision: revisionId("r42") }, source: "write_pitch:\n  out: Pitch  // strict" },
  profile: { ref: { id: "pitch_writer", model: "gpt-5.1" }, source: "provider: openai" },
  bindings: [binding("persona")],
  writesSource: "",
  checks: [],
  generatedSource: "",
}

const summary = (patch: Partial<NodeSummary>): NodeSummary => ({ id: nodeId("load_hotels"), kind: "tool", stage: 1, path: [], ...patch })

describe("nodes presenters", () => {
  it("joins the node list meta verbatim", () => {
    expect(nodeMeta(summary({}), stage)).toBe("stage 1")
    expect(nodeMeta(summary({ stage: 2, path: ["reduce"] }), stage)).toBe("stage 2 · reduce")
    expect(nodeMeta(summary({ stage: 4, path: ["branch b"], signature: { id: "write_pitch", version: "v7" } }), stage)).toBe(
      "stage 4 · branch b · write_pitch v7",
    )
    expect(nodeMeta(summary({ stage: 5, path: ["panel", "map ×3"], signature: { id: "check_grounding", version: "v2" } }), stage)).toBe(
      "stage 5 · panel · map ×3 · check_grounding v2",
    )
  })

  it("joins the contract header meta", () => {
    expect(contractMeta(contract, stage)).toBe("stage 4 · divergence branch b · wrapped by diverge ×4")
  })

  it("builds signature and profile references with registry tones and code lines", () => {
    expect(signatureReference(contract)).toEqual({
      text: "write_pitch",
      detail: "v7 · r42",
      tone: REGISTRY_KIND.signature.tone,
      lines: [["write_pitch:"], ["  out: Pitch  ", { text: "// strict", mark: "comment" }]],
    })
    expect(profileReference(contract)).toEqual({ text: "pitch_writer", detail: "gpt-5.1", tone: "llm", lines: [["provider: openai"]] })
  })

  it("returns no reference for nodes without a signature or profile", () => {
    const tool: NodeContract = { ...contract, signature: null, profile: null }
    expect(signatureReference(tool)).toBeNull()
    expect(profileReference(tool)).toBeNull()
  })

  it("omits the revision from a signature chip detail when there is none", () => {
    const released: NodeContract = { ...contract, signature: { ref: { id: "score_hotel", version: "v3" }, source: "" } }
    expect(signatureReference(released)?.detail).toBe("v3")
  })

  it("counts resolved inputs and picks the status tone", () => {
    expect(resolution([binding("a"), binding("b")])).toEqual({ resolved: 2, total: 2, tone: "success" })
    expect(resolution([binding("a"), binding("b", { optional: true, resolved: false })])).toEqual({ resolved: 1, total: 2, tone: "warning" })
    expect(resolution([binding("a", { resolved: false }), binding("b", { optional: true, resolved: false })])).toEqual({
      resolved: 0,
      total: 2,
      tone: "destructive",
    })
    expect(resolution([])).toEqual({ resolved: 0, total: 0, tone: "success" })
  })

  it("renders input and type labels", () => {
    expect(inputLabel(binding("brief_extra"))).toBe("$brief_extra")
    expect(typeLabel(binding("brief_extra", { optional: true }))).toBe("string?")
    expect(typeLabel(binding("tone", { type: "Chunk[]" }))).toBe("Chunk[]")
  })

  it("joins registry trailing text and the revision label", () => {
    const entry: RegistryEntry = {
      kind: "signature",
      id: registryEntryId("write_pitch"),
      label: "write_pitch",
      summary: "v7 · r42 · 6 in → Pitch",
      usage: { count: 2, unit: "node" },
    }
    expect(registryTrailing(entry, "2 nodes")).toBe("v7 · r42 · 6 in → Pitch · 2 nodes")
    expect(revisionLabel({ id: revisionId("r42"), status: "draft" }, "draft")).toBe("r42 · draft")
  })

  it("lists every registry kind once", () => {
    expect([...REGISTRY_KINDS].sort()).toEqual(Object.keys(REGISTRY_KIND).sort())
  })
})
