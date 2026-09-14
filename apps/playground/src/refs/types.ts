export type RefRoot = "node" | "input" | "item" | "acc" | "iter"

export type RefSegment =
  | { kind: "field"; name: string }
  | { kind: "index"; index: number }
  | { kind: "lift" }

export type Ref = {
  root: RefRoot
  node: string
  segments: RefSegment[]
  lifted: boolean
  path: string
  text: string
}

export type RefErrorCode =
  | "not_a_ref"
  | "empty_root"
  | "bad_segment"
  | "unknown_node"
  | "no_run"
  | "no_render"
  | "no_value"
  | "no_iteration"
  | "unsupported_root"

export type RefError = { code: RefErrorCode; message: string }

export type ParseResult = { ok: true; ref: Ref } | { ok: false; error: RefError }

export type RefOrigin = {
  root: RefRoot
  label: string
  nodeId: string
  nodeKind: string
  description: string
  rootType: string
  type: string
  path: string
}

export type StaticResult = { ok: true; origin: RefOrigin } | { ok: false; error: RefError }

export type ValuePreview = {
  text: string
  bytes: number
  totalBytes: number
  truncated: boolean
}

export type ValueScope = "single" | "iterations"

export type RefValue = {
  value: unknown
  preview: ValuePreview
  lifted: boolean
  scope: ValueScope
  nodeId: string
}

export type ValueResult = { ok: true; found: RefValue } | { ok: false; error: RefError }

export type RefContext = { nodeId?: string; component?: string; index?: number }

export type RunRender = { input: unknown; output: unknown }

export type RunSnapshot = {
  input: unknown
  renders: Readonly<Record<string, RunRender>>
}

export type SlotKind = "ref" | "const" | "inline" | "broken"

export type SlotRef =
  | { kind: "ref"; ref: Ref }
  | { kind: "const"; value: unknown }
  | { kind: "inline"; value: unknown }
  | { kind: "broken"; error: RefError; value: unknown }

export type SlotProvenance = {
  slot: string
  kind: SlotKind
  ref: Ref | null
  origin: RefOrigin | null
  originError: RefError | null
  value: RefValue | null
  valueError: RefError | null
}
