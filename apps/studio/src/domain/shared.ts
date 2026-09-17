import type { DiffOp, PartKind, Provenance } from "./vocabulary"

export type Ratio = { readonly passed: number; readonly total: number }
export type Property = { readonly key: string; readonly value: string }

export type ProvenancedValue = {
  readonly provenance: Provenance
  readonly label: string
  readonly value?: string
  readonly unchanged?: boolean
}

export type CheckResult = { readonly name: string; readonly pass: boolean }

export type TextMark = Provenance | PartKind | DiffOp | "issue" | "comment" | "code"
export type TextRun = string | { readonly text: string; readonly mark: TextMark }
export type TextLine = readonly TextRun[]

export type ContentPart =
  | { readonly kind: "text" | "json"; readonly name: string; readonly meta: string; readonly text: string }
  | { readonly kind: "image"; readonly name: string; readonly meta: string; readonly width: number; readonly height: number; readonly caption: string; readonly version?: string }
  | { readonly kind: "audio"; readonly name: string; readonly meta: string; readonly waveform: readonly number[] }
  | { readonly kind: "document"; readonly name: string; readonly meta: string; readonly caption: string }
  | { readonly kind: "video"; readonly name: string; readonly meta: string; readonly width: number; readonly height: number; readonly frameTimesS: readonly number[]; readonly playhead: number; readonly caption: string }
