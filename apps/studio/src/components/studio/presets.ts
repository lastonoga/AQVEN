import type { CompileStatus, ExecutionStatus, IndexStatus, ModelFamily, NodeKind, RunStatus, Severity, WaitState } from "@/domain"
import type { Tone } from "./tone"

export const PROVENANCES = ["static", "data", "knowledge", "generated", "human"] as const
export type Provenance = (typeof PROVENANCES)[number]

export const PART_KINDS = ["text", "json", "image", "audio", "document", "video"] as const
export type PartKind = (typeof PART_KINDS)[number]

export type DiffOp = "add" | "remove"
export type TextMark = Provenance | PartKind | DiffOp | "issue" | "comment" | "code"
export type TextRun = string | { readonly text: string; readonly mark: TextMark }
export type TextLine = readonly TextRun[]

export type ContentPart =
  | { readonly kind: "text" | "json"; readonly name: string; readonly meta: string; readonly text: string }
  | { readonly kind: "image"; readonly name: string; readonly meta: string; readonly width: number; readonly height: number; readonly caption: string; readonly version?: string }
  | { readonly kind: "audio"; readonly name: string; readonly meta: string; readonly waveform: readonly number[] }
  | { readonly kind: "document"; readonly name: string; readonly meta: string; readonly caption: string }
  | { readonly kind: "video"; readonly name: string; readonly meta: string; readonly width: number; readonly height: number; readonly frameTimesS: readonly number[]; readonly playhead: number; readonly caption: string }

export type ProvenancedValue = {
  readonly provenance: Provenance
  readonly label: string
  readonly value?: string
  readonly unchanged?: boolean
}

export type MarkerShape = "circle" | "diamond" | "end"
export type KindSpec = { readonly code: string; readonly tone: Tone }
export type ProvenanceSpec = { readonly glyph: string; readonly tone: Tone; readonly dashed: boolean; readonly shape: "box" | "round" }
export type TextMarkStyle = "chip" | "dashed" | "ink" | "code"
export type TextMarkSpec = { readonly style: TextMarkStyle; readonly tone: Tone }

export const NODE_KIND: Readonly<Record<NodeKind, KindSpec>> = {
  llm: { code: "LLM", tone: "llm" },
  code: { code: "CODE", tone: "neutral" },
  tool: { code: "TOOL", tone: "tool" },
  human: { code: "HUMAN", tone: "warning" },
  parallel: { code: "PAR", tone: "primary" },
  map: { code: "MAP", tone: "tool" },
  switch: { code: "SWITCH", tone: "warning" },
  loop: { code: "LOOP", tone: "loop" },
  call: { code: "CALL", tone: "success" },
  narrow: { code: "NARROW", tone: "neutral" },
}

export const RUN_STATUS_TONE: Readonly<Record<RunStatus, Tone>> = {
  queued: "neutral",
  running: "primary",
  suspended: "warning",
  completed: "success",
  failed: "destructive",
  cancelled: "neutral",
}

export const EXECUTION_STATUS_TONE: Readonly<Record<ExecutionStatus, Tone>> = {
  pending: "neutral",
  running: "primary",
  ok: "success",
  failed: "destructive",
  skipped: "neutral",
  suspended: "warning",
  cancelled: "neutral",
}

export const COMPILE_STATUS_TONE: Readonly<Record<CompileStatus, Tone>> = {
  ok: "success",
  not_runnable: "warning",
  invalid: "destructive",
  unreadable: "destructive",
}

export const INDEX_STATUS_TONE: Readonly<Record<IndexStatus, Tone>> = {
  ready: "success",
  building: "primary",
  degraded: "warning",
}

export const WAIT_STATE_TONE: Readonly<Record<WaitState, Tone>> = {
  waiting: "warning",
  resolved: "success",
  timed_out: "destructive",
}

export const SEVERITY_TONE: Readonly<Record<Severity, Tone>> = {
  error: "destructive",
  warning: "warning",
}

export const MODEL_FAMILY: Readonly<Record<ModelFamily, { readonly label: string }>> = {
  openai: { label: "OpenAI" },
  anthropic: { label: "Anthropic" },
  google: { label: "Google" },
  deepseek: { label: "DeepSeek" },
  qwen: { label: "Qwen" },
  moonshot: { label: "Moonshot" },
  zhipu: { label: "Zhipu" },
  xai: { label: "xAI" },
  meta: { label: "Meta" },
  mistral: { label: "Mistral" },
  other: { label: "Other" },
}

export const PROVENANCE: Readonly<Record<Provenance, ProvenanceSpec>> = {
  static: { glyph: "▪", tone: "neutral", dashed: false, shape: "box" },
  data: { glyph: "▤", tone: "tool", dashed: false, shape: "box" },
  knowledge: { glyph: "▦", tone: "warning", dashed: false, shape: "round" },
  generated: { glyph: "✦", tone: "llm", dashed: false, shape: "round" },
  human: { glyph: "◌", tone: "warning", dashed: true, shape: "box" },
}

export const PART_KIND: Readonly<Record<PartKind, KindSpec>> = {
  text: { code: "TXT", tone: "neutral" },
  json: { code: "JSON", tone: "neutral" },
  image: { code: "IMG", tone: "llm" },
  audio: { code: "AUD", tone: "tool" },
  document: { code: "DOC", tone: "success" },
  video: { code: "VID", tone: "warning" },
}

const provenanceMark = (provenance: Provenance): TextMarkSpec => ({
  style: PROVENANCE[provenance].dashed ? "dashed" : "chip",
  tone: PROVENANCE[provenance].tone,
})

const partMark = (kind: PartKind): TextMarkSpec => ({ style: "chip", tone: PART_KIND[kind].tone })

export const TEXT_MARK: Readonly<Record<TextMark, TextMarkSpec>> = {
  static: provenanceMark("static"),
  data: provenanceMark("data"),
  knowledge: provenanceMark("knowledge"),
  generated: provenanceMark("generated"),
  human: provenanceMark("human"),
  text: partMark("text"),
  json: partMark("json"),
  image: partMark("image"),
  audio: partMark("audio"),
  document: partMark("document"),
  video: partMark("video"),
  add: { style: "ink", tone: "success" },
  remove: { style: "ink", tone: "destructive" },
  issue: { style: "chip", tone: "destructive" },
  comment: { style: "ink", tone: "neutral" },
  code: { style: "code", tone: "neutral" },
}
