import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createTranslator } from "use-intl"
import { CALL_SHEET_TABS, type CallDetail, type CallSheetTab, type TextLine } from "@/domain"
import type { Inline, PropertyRow, SectionBody, SectionSpec, Span } from "@/components/studio"
import { formats } from "@/i18n/formats"
import { messages } from "@/i18n/messages"
import { callDetails } from "@/mocks/data/calls"
import { WORKFLOWS, workflowKey } from "@/mocks/data/keys"
import type { SectionContext } from "./context"
import { callSheetHeader, callSheetTabs } from "./header"
import { CALL_SHEET_SECTIONS } from "./sections"

const t = createTranslator({ locale: "en", messages: messages.en, formats })

const tags: SectionContext["tags"] = { b: (chunks) => chunks, v: (chunks) => chunks, code: (chunks) => chunks }

const ctx: SectionContext = { t, tags }

const designedCall = (): CallDetail => {
  const detail = callDetails[workflowKey(WORKFLOWS.pitchPipeline, "call_01HT9")]
  if (detail === undefined) throw new Error("call_01HT9 is missing from the mock backend")
  return detail
}

const isSpanList = (value: Inline): value is readonly Span[] => Array.isArray(value)

const spanText = (span: Span): string => [span.glyph, span.text].filter((part) => part !== undefined).join(" ")

const inlineText = (value: Inline): string => {
  if (typeof value === "string") return value
  if (!isSpanList(value)) return spanText(value)
  return value.map(spanText).join("")
}

const nodeText = (node: ReactNode): string => render(<>{node}</>).container.textContent

const lineText = (line: TextLine): string => line.map((run) => (typeof run === "string" ? run : run.text)).join("")

const sectionsOf = (tab: CallSheetTab, detail: CallDetail = designedCall()): readonly SectionSpec[] => CALL_SHEET_SECTIONS[tab](detail, ctx)

const sectionAt = (tab: CallSheetTab, index: number): SectionSpec => {
  const section = sectionsOf(tab)[index]
  if (section === undefined) throw new Error(`no section ${String(index)} on ${tab}`)
  return section
}

const rowsOf = (section: SectionSpec): readonly (readonly [string, string])[] =>
  section.body.kind === "properties" ? section.body.rows.map((row: PropertyRow) => [inlineText(row.key), inlineText(row.value)] as const) : []

const tonesOf = (section: SectionSpec): readonly (string | undefined)[] =>
  section.body.kind === "properties" ? section.body.rows.map((row) => row.tone) : []

const linesOf = (section: SectionSpec): readonly string[] => (section.body.kind === "text" ? section.body.lines.map(lineText) : [])

const BODY_SIZE: { readonly [K in SectionBody["kind"]]: (body: SectionBody<K>) => number } = {
  properties: (body) => body.rows.length,
  text: (body) => body.lines.length,
  parts: (body) => body.parts.length,
  node: () => 1,
}

const bodySizeOf = <K extends SectionBody["kind"]>(body: SectionBody<K>): number => {
  const size: (body: SectionBody<K>) => number = BODY_SIZE[body.kind]
  return size(body)
}

const bodySize = (section: SectionSpec): number => bodySizeOf(section.body)

const titlesOf = (tab: CallSheetTab): readonly string[] => sectionsOf(tab).map((section) => nodeText(section.title))

describe("callSheetHeader", () => {
  it("renders the designed identity of call_01HT9", () => {
    const header = callSheetHeader(designedCall(), t)
    expect(header.kind).toEqual({ code: "LLM", tone: "llm" })
    expect(header.title).toBe("pitch_gen_b")
    expect(header.context).toBe("branch b · stage 4 · row #07")
    expect(header.meta).toBe("call_01HT9 · attempt 4 of 4 · $0.0611 total")
  })

  it("labels the tabs in URL order", () => {
    expect(callSheetTabs(t)).toEqual([
      { value: "model", label: "Model" },
      { value: "input", label: "Input" },
      { value: "prompt", label: "Prompt" },
      { value: "output", label: "Output" },
      { value: "assertions", label: "Assertions" },
    ])
  })
})

describe("CALL_SHEET_SECTIONS · model", () => {
  it("titles the four sections", () => {
    expect(titlesOf("model")).toEqual(["Provider and model", "Routing", "Call parameters", "What was billed"])
  })

  it("lists provider and model verbatim", () => {
    expect(rowsOf(sectionAt("model", 0))).toEqual([
      ["provider", "Anthropic (direct)"],
      ["model", "claude-sonnet-4.5"],
      ["snapshot", "2025-09-29"],
      ["API", "messages v1 · stream"],
      ["region", "us-east-1"],
      ["quantization", "managed · not configurable"],
      ["context", "200k"],
      ["billing", "by provider tokens"],
    ])
  })

  it("formats routing, parameters and billing", () => {
    expect(rowsOf(sectionAt("model", 1))).toEqual([
      ["profile", "pitch_fast"],
      ["order", "sonnet-4.5 → sonnet-4.5-mini"],
      ["fallback reason", "429 · rate limit"],
      ["retries", "3 · exp. backoff 0.5→4 s"],
      ["timeout", "60 s"],
      ["cassette", "none · live call"],
    ])
    expect(rowsOf(sectionAt("model", 2))).toEqual([
      ["temperature", "0.9"],
      ["top_p", "1.0"],
      ["max_tokens", "8192 (r42, was 4096)"],
      ["seed", "1337"],
      ["stop", "—"],
      ["response_format", "json_schema · strict"],
    ])
    expect(rowsOf(sectionAt("model", 3))).toEqual([
      ["input / output", "1,998 / 604 tokens"],
      ["price per 1k", "$0.003 / $0.015"],
      ["attempt 4", "$0.0126"],
      ["failed attempts", "$0.0100"],
      ["call total", "$0.0611"],
    ])
  })
})

describe("CALL_SHEET_SECTIONS · input", () => {
  it("titles sections with counts and the row reference", () => {
    expect(titlesOf("input")).toEqual(["Input parts · multimodal · 5", "Input slots · 6", "Row #07 values", "What came from the freeze"])
  })

  it("keeps the multimodal parts in order", () => {
    const section = sectionAt("input", 0)
    const kinds = section.body.kind === "parts" ? section.body.parts.map((part) => part.kind) : []
    expect(kinds).toEqual(["text", "image", "audio", "document", "text"])
  })

  it("prefixes slots with their provenance glyph", () => {
    expect(rowsOf(sectionAt("input", 1))).toEqual([
      ["✦ ranked.items[0..2]", "$rank_hotels.out"],
      ["▤ facts", "$load_hotels.out"],
      ["▦ tone.chunks", "brand_voice v4 · 4 chunks"],
      ["▪ persona", "“family” · row #07"],
      ["◌ brief_extra", "@lead · “no superlatives”"],
      ["▪ format", "from the Pitch type"],
    ])
  })

  it("renders row values and freeze origins", () => {
    expect(linesOf(sectionAt("input", 2))).toEqual([
      "hotel: Bella Vista Resort · rating 3.9",
      "facts.beach_distance_m: 2100",
      "facts.pool: true · facts.kids_club: false",
      "persona: «family»",
      "input hash: a71e4c92",
    ])
    expect(rowsOf(sectionAt("input", 3))).toEqual([
      ["load_hotels", "recorded value from run #8247"],
      ["rank_hotels", "recorded value from run #8247"],
      ["knowledge", "brand_voice v4 · draft r42"],
    ])
  })
})

describe("CALL_SHEET_SECTIONS · prompt", () => {
  it("titles sections with embedded template data", () => {
    expect(titlesOf("prompt")).toEqual([
      "Template pitch_v7 · revision r42",
      "Compiled prompt · system",
      "Compiled prompt · user · 1,998 tokens",
      "Diff against previous revision",
    ])
  })

  it("marks template slots with the slot provenance", () => {
    const section = sectionAt("prompt", 0)
    const lines = section.body.kind === "text" ? section.body.lines : []
    const marks = lines.flatMap((line) => line.flatMap((run) => (typeof run === "string" ? [] : [[run.text, run.mark]])))
    expect(marks).toEqual([
      ["$persona", "static"],
      ["$tone.chunks", "knowledge"],
      ["$ranked.items[0..2]", "generated"],
      ["$facts", "data"],
      ["$brief_extra", "human"],
    ])
  })

  it("keeps compiled prompts line by line and signs the diff", () => {
    expect(linesOf(sectionAt("prompt", 1))).toHaveLength(1)
    expect(linesOf(sectionAt("prompt", 2))).toHaveLength(16)
    expect(linesOf(sectionAt("prompt", 3))).toEqual(["+ superlatives banned (brand_voice v4)", "− “make the copy vivid and unforgettable”"])
  })
})

describe("CALL_SHEET_SECTIONS · output", () => {
  it("titles sections with token counts and the parsed type", () => {
    expect(titlesOf("output")).toEqual([
      "Output parts · multimodal · 4",
      "Raw response · 604 tokens",
      "Parsed against Pitch",
      "Schema validation",
      "Comparison with expected",
    ])
  })

  it("renders parsed fields with a destructive empty string", () => {
    const section = sectionAt("output", 2)
    expect(rowsOf(section)).toEqual([
      ["title", "ok · 21 of 90 chars"],
      ["body", "ok · 412 chars"],
      ["hooks[0]", "“12 ha park”"],
      ["hooks[1]", "“1,200 m² spa”"],
      ["hooks[2]", "empty string"],
    ])
    expect(tonesOf(section)).toEqual([undefined, undefined, undefined, undefined, "destructive"])
  })

  it("renders validation and comparison lines", () => {
    expect(linesOf(sectionAt("output", 3))).toEqual(["FAIL hooks[2]: minLength 1 — got an empty string", "other fields valid · strict mode"])
    const comparison = linesOf(sectionAt("output", 4))
    expect(comparison.map((line) => line.replace(/\s+/g, " "))).toEqual([
      "actual: “Park, spa and quiet”",
      "expected: “A holiday next to the park”",
      "semantic match 0.71 · factual 1.00",
    ])
  })
})

describe("CALL_SHEET_SECTIONS · assertions", () => {
  it("titles sections with the row and quorum", () => {
    expect(titlesOf("assertions")).toEqual(["Row #07 assertions", "Judges · quorum(2)", "History for this row"])
  })

  it("renders assertions, judges and history", () => {
    const assertions = sectionAt("assertions", 0)
    expect(rowsOf(assertions)).toEqual([
      ["hooks[*] non-empty", "FAIL"],
      ["no banned words", "PASS"],
      ["every number exists in facts", "PASS"],
    ])
    expect(tonesOf(assertions)).toEqual(["destructive", undefined, undefined])
    expect(rowsOf(sectionAt("assertions", 1))).toEqual([
      ["judge_style · opus-4.1", "0.83"],
      ["judge_facts · gpt-5.1-mini", "0.88"],
      ["judge_tone · gemini-3-flash", "0.80"],
      ["decision", "accepted 2 of 3"],
    ])
    expect(rowsOf(sectionAt("assertions", 2))).toEqual([
      ["r41", "FAIL · truncated at 4096"],
      ["r42 · draft", "FAIL · empty third hook"],
      ["dataset", "pitch_golden_v4"],
    ])
  })
})

describe("CALL_SHEET_SECTIONS · sections without content", () => {
  const bare: CallDetail = {
    ...designedCall(),
    input: { parts: [], slots: [], rowValues: [], freeze: [] },
    prompt: { template: { id: "—", revision: designedCall().prompt.template.revision, text: "" }, system: "", user: { text: "", tokens: 0 }, diff: [] },
    checks: { ...designedCall().checks, judges: { quorum: 0, votes: [], decision: { verdict: "approved", passed: 0, total: 0 } } },
  }

  it("leaves out empty input and prompt sections", () => {
    expect(sectionsOf("input", bare)).toEqual([])
    expect(sectionsOf("prompt", bare)).toEqual([])
  })

  it("leaves out the judges section when no judge voted", () => {
    expect(sectionsOf("assertions", bare).map((section) => section.id)).toEqual(["call-checks-assertions", "call-checks-history"])
  })
})

describe("CALL_SHEET_SECTIONS · every mocked call", () => {
  const details = Object.values(callDetails)

  it.each(CALL_SHEET_TABS)("renders no empty section body on the %s tab", (tab) => {
    const empty = details.flatMap((detail) =>
      sectionsOf(tab, detail)
        .filter((section) => bodySize(section) === 0)
        .map((section) => `${detail.id}/${section.id}`),
    )
    expect(empty).toEqual([])
  })

  it.each(CALL_SHEET_TABS)("presents the %s tab without blank values", (tab) => {
    const values = details.flatMap((detail) => sectionsOf(tab, detail).flatMap((section) => rowsOf(section).map(([, value]) => value)))
    expect(values).not.toContain("")
  })
})
