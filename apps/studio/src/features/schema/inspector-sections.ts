import type { InspectorTab, NodeInspection, ProvenancedValue } from "@/domain"
import { PROVENANCE, type PropertyRow, type SectionBody, type SectionSpec } from "@/components/studio"
import { codeLines, plainLines } from "@/lib/text"

export type InspectorSectionKey = "node" | "effectiveConfig" | "inputSlots" | "prompt" | "slots" | "outputType" | "sourceYaml"

export type InspectorContext = {
  readonly title: (key: InspectorSectionKey) => string
  readonly none: string
}

export type InspectorPresenter = (inspection: NodeInspection, ctx: InspectorContext) => readonly SectionSpec[]

const section = (key: InspectorSectionKey, ctx: InspectorContext, body: SectionBody): SectionSpec => ({
  id: `inspector-${key}`,
  title: ctx.title(key),
  body,
})

const inputRows = (inputs: readonly ProvenancedValue[], none: string): readonly PropertyRow[] =>
  inputs.map((input) => ({ key: { glyph: PROVENANCE[input.provenance].glyph, text: input.label }, value: input.value ?? none }))

export const INSPECTOR_SECTIONS: Readonly<Record<InspectorTab, InspectorPresenter>> = {
  overview: (inspection, ctx) => [
    section("node", ctx, { kind: "properties", rows: inspection.overview }),
    section("effectiveConfig", ctx, { kind: "properties", rows: inspection.config }),
  ],
  input: (inspection, ctx) => [section("inputSlots", ctx, { kind: "properties", rows: inputRows(inspection.inputs, ctx.none) })],
  prompt: (inspection, ctx) => [
    section("prompt", ctx, { kind: "text", lines: plainLines(inspection.prompt) }),
    section("slots", ctx, { kind: "properties", rows: inspection.slots }),
  ],
  output: (inspection, ctx) => [section("outputType", ctx, { kind: "text", lines: codeLines(inspection.outputType) })],
  source: (inspection, ctx) => [section("sourceYaml", ctx, { kind: "text", lines: codeLines(inspection.source) })],
}
