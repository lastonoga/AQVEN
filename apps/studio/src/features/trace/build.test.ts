import { describe, expect, it } from "vitest"
import type { ApiRunEvent } from "@/domain"
import { liveNodePrompts, liveNodes } from "@/mocks/data/nodes"
import { COMPLETED_RUN_ID, liveRunEvents, liveRunSnapshots } from "@/mocks/data/runs"
import { buildTrace } from "./build"
import type { MatrixGroup, StageRun } from "./model"

const FLOW_ID = "support_case"

const snapshot = liveRunSnapshots[COMPLETED_RUN_ID]
const nodes = liveNodes[FLOW_ID] ?? []
const prompts = Object.fromEntries(
  Object.entries(liveNodePrompts)
    .filter(([key]) => key.startsWith(`${FLOW_ID}/`))
    .map(([, detail]) => [detail.node_id, detail]),
)

const trace = buildTrace({
  executions: snapshot?.executions ?? [],
  order: snapshot?.order ?? [],
  nodes,
  prompts,
  events: liveRunEvents[COMPLETED_RUN_ID] ?? [],
})

const stage = (nodeId: string): StageRun | undefined => trace.stages.find((item) => item.nodeId === nodeId)

const names = (group: MatrixGroup | undefined): readonly string[] => (group?.columns ?? []).map((column) => column.name)

describe("buildTrace", () => {
  it("keeps one stage per top-level node in flow order", () => {
    expect(trace.stages.map((item) => item.nodeId)).toEqual(snapshot?.order)
    expect(trace.pending).toEqual([])
  })

  it("puts the branches of a parallel node in one group, side by side", () => {
    const drafts = stage("drafts")
    expect(drafts?.groups).toHaveLength(1)
    expect(names(drafts?.groups[0])).toEqual(["gpt", "mistral"])
    expect(drafts?.groups[0]?.columns.map((column) => column.coordinate?.value)).toEqual(["gpt", "mistral"])
  })

  it("puts the items of a map node in one group", () => {
    const vote = stage("vote")
    expect(names(vote?.groups[0])).toEqual(["ballot", "ballot", "ballot"])
    expect(vote?.groups[0]?.columns.map((column) => column.coordinate?.kind)).toEqual(["item", "item", "item"])
  })

  it("lays the iterations of a loop out side by side in one group", () => {
    const polish = stage("polish")
    expect(polish?.groups).toHaveLength(1)
    expect(names(polish?.groups[0])).toEqual(["revise", "critique", "revise", "critique"])
    expect(polish?.groups[0]?.columns.map((column) => column.coordinate?.value)).toEqual(["0", "0", "1", "1"])
  })

  it("nests the calls of a called flow under the column that ran them", () => {
    const panel = stage("panel")
    const judges = panel?.groups[0]?.columns.find((column) => column.name === "judges")
    expect(judges?.child?.fanOut).toBe(3)
    expect(names(judges?.child?.group)).toEqual(["deepseek", "qwen", "llama"])
  })

  it("reads the loop exit from the run events", () => {
    expect(stage("polish")?.exit?.reason).toBe("policy")
    expect(stage("record")?.exit?.selectedIteration).toBe(1)
    expect(stage("polish")?.exit?.selectedIteration).toBe(0)
  })

  it("turns failed attempts into a ladder and into post-check findings", () => {
    const gpt = stage("drafts")?.groups[0]?.columns.find((column) => column.name === "gpt")
    expect(gpt?.check?.failedAttempts).toBe(3)
    expect(gpt?.check?.findings.map((finding) => finding.name)).toContain("check_failed")
    expect(stage("drafts")?.ladders[0]?.attempts).toHaveLength(3)
  })

  it("carries the prompt of the node and the recorded output of the call", () => {
    const gpt = stage("drafts")?.groups[0]?.columns.find((column) => column.name === "gpt")
    expect(gpt?.prompt?.inference).toBe("revise")
    expect(gpt?.prompt?.kind).toBe("missing")
    expect(gpt?.output?.identity.kind).toBe("inline")
    expect(gpt?.output?.text).toContain("reply")
  })

  it("previews recorded model messages instead of the current template", () => {
    const original = stage("drafts")?.groups[0]?.columns.find((column) => column.name === "gpt")
    if (original === undefined) throw new Error("missing gpt execution")
    const captured = {
      seq: 999,
      at: "2026-09-18T12:00:00Z",
      run_id: COMPLETED_RUN_ID,
      type: "inference_prompt_captured",
      address: original.address,
      prompt: {
        level: 2,
        template_sha256: "sha256-template",
        rendered_sha256: "sha256-rendered",
        rendered_ref: null,
        messages: [
          { role: "system", parts: [{ kind: "text", text: "Be precise", media: null }] },
          { role: "user", parts: [{ kind: "text", text: "Answer for Alice", media: null }] },
        ],
        slot_ranges: [],
        variants: {},
        output_schema_sent: null,
      },
    } satisfies ApiRunEvent
    const updated = buildTrace({
      executions: snapshot?.executions ?? [],
      order: snapshot?.order ?? [],
      nodes,
      prompts,
      events: [...(liveRunEvents[COMPLETED_RUN_ID] ?? []), captured],
    })
    const gpt = updated.stages.find((item) => item.nodeId === "drafts")?.groups[0]?.columns.find((column) => column.name === "gpt")
    expect(gpt?.prompt?.kind).toBe("captured")
    expect(JSON.stringify(gpt?.prompt?.lines)).toContain("Answer for Alice")
    expect(JSON.stringify(gpt?.prompt?.lines)).not.toContain("{{")
  })

  it("names the upstream nodes a leaf call reads when the engine records no input", () => {
    const gpt = stage("drafts")?.groups[0]?.columns.find((column) => column.name === "gpt")
    expect(gpt?.input?.kind).toBe("upstream")
    expect(gpt?.input?.kind === "upstream" ? gpt.input.refs.map((ref) => ref.nodeId) : []).toContain("search_kb")
  })

  it("lists the media a payload carries by blob id", () => {
    const illustrate = stage("illustrate")?.groups[0]?.columns[0]
    expect(illustrate?.output?.media.map((media) => media.mediaType)).toEqual(["image/jpeg"])
  })
})
