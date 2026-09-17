import type {
  CallSheetTab,
  ClaimVerdict,
  GatewayMode,
  JudgeVerdict,
  ModelFamily,
  NodeKind,
  Outcome,
  PartKind,
  Provenance,
  RowKey,
  StageKind,
  TextMark,
  Verdict,
} from "@/domain"
import type { Tone } from "./tone"

export type MarkerShape = "circle" | "diamond" | "end"
export type KindSpec = { readonly code: string; readonly tone: Tone }
export type StageKindSpec = KindSpec & { readonly marker: MarkerShape; readonly glyph: string | null }
export type GatewaySpec = { readonly glyph: string; readonly tone: Tone }
export type ProvenanceSpec = { readonly glyph: string; readonly tone: Tone; readonly dashed: boolean; readonly shape: "box" | "round" }
export type TextMarkStyle = "chip" | "dashed" | "ink" | "code"
export type TextMarkSpec = { readonly style: TextMarkStyle; readonly tone: Tone }

const SCORE_WARNING_BELOW = 0.7

export const OUTCOME_TONE: Readonly<Record<Outcome, Tone>> = {
  ok: "success",
  degraded: "warning",
  failed: "destructive",
  cached: "neutral",
  idle: "neutral",
  waiting: "warning",
  skipped: "neutral",
  aborted: "loop",
  awaiting: "warning",
  intermediate: "neutral",
}

export const VERDICT_OUTCOME: Readonly<Record<Verdict | JudgeVerdict | ClaimVerdict, Outcome>> = {
  pass: "ok",
  fail: "failed",
  approved: "ok",
  needs_human: "degraded",
  rejected: "failed",
  matched: "ok",
  invented: "failed",
}

export const NODE_KIND: Readonly<Record<NodeKind, KindSpec>> = {
  tool: { code: "TOOL", tone: "tool" },
  llm: { code: "LLM", tone: "llm" },
  fn: { code: "FN", tone: "neutral" },
  human: { code: "HUM", tone: "warning" },
  image: { code: "IMG", tone: "llm" },
  audio: { code: "AUD", tone: "tool" },
  video: { code: "VID", tone: "warning" },
}

export const STAGE_KIND: Readonly<Record<StageKind, StageKindSpec>> = {
  seq: { code: "SEQ", tone: "neutral", marker: "circle", glyph: null },
  map: { code: "MAP", tone: "tool", marker: "diamond", glyph: "+" },
  diverge: { code: "DIVERGE", tone: "llm", marker: "diamond", glyph: "+" },
  parallel: { code: "PARALLEL", tone: "llm", marker: "circle", glyph: null },
  loop: { code: "LOOP", tone: "loop", marker: "diamond", glyph: "⟳" },
  switch: { code: "SWITCH", tone: "warning", marker: "diamond", glyph: "×" },
}

export const GATEWAY: Readonly<Record<GatewayMode, GatewaySpec>> = {
  all: { glyph: "+", tone: "llm" },
  one: { glyph: "×", tone: "warning" },
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

export const MODEL_FAMILY: Readonly<Record<ModelFamily, { readonly label: string }>> = {
  anthropic: { label: "Anthropic" },
  openai: { label: "OpenAI" },
  google: { label: "Google" },
  mistral: { label: "Mistral" },
}

export const ROW_SHEET_TAB: Readonly<Record<RowKey, CallSheetTab | null>> = {
  columns: null,
  call: "model",
  agent: "model",
  model: "model",
  input: "input",
  prompt: "prompt",
  output: "output",
  postCheck: "assertions",
  assertions: "assertions",
}

export const scoreTone = (score: number, stopped: boolean): Tone => {
  if (stopped) return "loop"
  return score < SCORE_WARNING_BELOW ? "warning" : "success"
}
