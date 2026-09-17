import { describe, expect, it } from "vitest"
import { INSPECTOR_TABS, type NodeInspection } from "@/domain"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import { inspections } from "@/mocks/data/schema"
import { INSPECTOR_SECTIONS, type InspectorContext } from "./inspector-sections"

const TITLES = {
  node: "Node",
  effectiveConfig: "Effective config",
  inputSlots: "Input slots",
  prompt: "Prompt",
  slots: "Slots",
  outputType: "Output type",
  sourceYaml: "Source · YAML",
} as const

const CONTEXT: InspectorContext = {
  none: "—",
  title: (key) => TITLES[key],
}

const pitchGenB = (): NodeInspection => {
  const inspection = inspections[workflowKey(WORKFLOWS.pitchPipeline, "pitch_gen_b")]
  if (inspection === undefined) throw new Error("pitch_gen_b inspection is missing")
  return inspection
}

describe("INSPECTOR_SECTIONS", () => {
  it("builds the sections of every tab", () => {
    const ids = Object.fromEntries(INSPECTOR_TABS.map((tab) => [tab, INSPECTOR_SECTIONS[tab](pitchGenB(), CONTEXT).map((section) => section.id)]))
    expect(ids).toEqual({
      overview: ["inspector-node", "inspector-effectiveConfig"],
      input: ["inspector-inputSlots"],
      prompt: ["inspector-prompt", "inspector-slots"],
      output: ["inspector-outputType"],
      source: ["inspector-sourceYaml"],
    })
  })

  it("prefixes input slot keys with the provenance glyph", () => {
    const [inputs] = INSPECTOR_SECTIONS.input(pitchGenB(), CONTEXT)
    expect(inputs?.title).toBe("Input slots")
    expect(inputs?.body).toMatchObject({
      kind: "properties",
      rows: [
        { key: { glyph: "✦", text: "ranked.items[0..2]" }, value: "$rank_hotels.out" },
        { key: { glyph: "▤", text: "facts" }, value: "$load_hotels.out" },
        { key: { glyph: "▦", text: "tone.chunks" }, value: "brand_voice v4 · 4 chunks" },
        { key: { glyph: "▪", text: "persona" }, value: '"family" · static' },
        { key: { glyph: "◌", text: "brief_extra" }, value: "@lead · human" },
        { key: { glyph: "▪", text: "format" }, value: "from the Pitch type" },
      ],
    })
  })

  it("uses the none label for inputs without a value", () => {
    const [inputs] = INSPECTOR_SECTIONS.input({ ...pitchGenB(), inputs: [{ provenance: "data", label: "facts" }] }, CONTEXT)
    expect(inputs?.body).toMatchObject({ rows: [{ value: "—" }] })
  })

  it("keeps the prompt as plain lines and marks source comments", () => {
    const [prompt] = INSPECTOR_SECTIONS.prompt(pitchGenB(), CONTEXT)
    expect(prompt?.body).toMatchObject({ kind: "text" })
    expect(prompt?.body.kind === "text" ? prompt.body.lines.slice(0, 3) : []).toEqual([
      ["You are writing a hotel pitch for the audience $persona."],
      [""],
      ["Tone and bans:"],
    ])
    const [source] = INSPECTOR_SECTIONS.source(pitchGenB(), CONTEXT)
    expect(source?.body.kind === "text" ? source.body.lines[7] : []).toEqual(["  max_tokens: 8192   ", { text: "# r42", mark: "comment" }])
  })
})
