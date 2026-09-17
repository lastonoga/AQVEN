import { describe, expect, it } from "vitest"
import type { NodeContract, NodesOverview } from "@/domain"
import { WORKFLOW_IDS, WORKSPACE, workflowKey } from "@/mocks/data/keys"
import { contracts, nodesOverviews } from "@/mocks/data/nodes"

const PITCH = "pitch_pipeline"

const PITCH_CANVAS_NODES = [
  "load_hotels",
  "score_hotel",
  "rank_hotels",
  "pitch_gen_a",
  "pitch_gen_b",
  "pitch_gen_c",
  "pitch_gen_d",
  "judge_style",
  "judge_facts",
  "judge_tone",
  "fix_draft",
  "decide_pitch",
  "publish_deck",
  "archive_draft",
]

const overviewOf = (workflow: string): NodesOverview | undefined => nodesOverviews[workflowKey(workflow)]

const contractOf = (workflow: string, node: string): NodeContract | undefined => contracts[workflowKey(workflow, node)]

const listedContracts = (workflow: string): readonly (NodeContract | undefined)[] =>
  (overviewOf(workflow)?.nodes ?? []).map((node) => contractOf(workflow, node.id))

const contractUrl = (workflow: string, node: string): string => `/api/v1/workspaces/${WORKSPACE}/workflows/${workflow}/nodes/${node}/contract`

describe("nodes mock backend", () => {
  it.each(WORKFLOW_IDS)("has a non-empty overview and a matching contract for every listed node of %s", (workflow) => {
    const nodes = overviewOf(workflow)?.nodes ?? []
    expect(nodes.length).toBeGreaterThan(0)
    const found = listedContracts(workflow)
    expect(found.map((item) => item?.id)).toEqual(nodes.map((node) => node.id))
    expect(found.map((item) => [item?.kind, item?.stage])).toEqual(nodes.map((node) => [node.kind, node.stage]))
  })

  it.each(WORKFLOW_IDS)("keeps list, contract and registry signatures in step for %s", (workflow) => {
    const overview = overviewOf(workflow)
    const listed = (overview?.nodes ?? []).map((node) => node.signature?.id ?? null)
    expect(listedContracts(workflow).map((item) => item?.signature?.ref.id ?? null)).toEqual(listed)
    const registered: ReadonlySet<string> = new Set(overview?.registry.signature.map((entry) => entry.id))
    expect(listed.filter((id) => id !== null).every((id) => registered.has(id))).toBe(true)
  })

  it("keeps the designed pitch_pipeline overview with a registry entry per profile and signature", () => {
    const overview = overviewOf(PITCH)
    expect(overview?.revision).toEqual({ id: "r42", status: "draft" })
    expect(overview?.nodes.map((node) => node.id)).toEqual(["load_hotels", "score_hotel", "rank_hotels", "pitch_gen_b", "judge_facts", "fix_draft", "decide_pitch"])
    const registry = overview?.registry
    expect([registry?.signature.length, registry?.profile.length, registry?.adapter.length, registry?.type.length]).toEqual([7, 7, 5, 6])
  })

  it("keeps the designed pitch_gen_b contract verbatim", () => {
    const contract = contractOf(PITCH, "pitch_gen_b")
    expect(contract?.bindings.map((binding) => binding.input)).toEqual(["persona", "ranked", "facts", "tone", "brief_extra", "last_remarks"])
    expect(contract?.checks).toHaveLength(4)
    expect(contract?.writesSource.split("\n")).toEqual([
      "writes:",
      "  $state.drafts  // reducer: append",
      "  $state.cost    // reducer: sum",
      "out: Pitch → consumed by judge_facts, fix_draft",
    ])
  })

  it("aligns generated write comments like the designed contract", () => {
    expect(contractOf(PITCH, "fix_draft")?.writesSource).toBe(contractOf(PITCH, "pitch_gen_b")?.writesSource.replace("fix_draft", "decide_pitch"))
  })

  it("has a contract for every inspectable pitch_pipeline canvas node", () => {
    expect(PITCH_CANVAS_NODES.map((node) => contractOf(PITCH, node)?.id)).toEqual(PITCH_CANVAS_NODES)
  })

  it("serves contracts over HTTP and answers 404 for an unknown node", async () => {
    expect((await fetch(contractUrl(PITCH, "pitch_gen_b"))).status).toBe(200)
    expect((await fetch(contractUrl(PITCH, "nope"))).status).toBe(404)
  })
})
