import { parseSlot } from "./parse.js"
import { previewOf } from "./preview.js"
import { resolveStatic } from "./static.js"
import { resolveValue } from "./value.js"
import type { Ir } from "../api/types.js"
import type {
  Ref,
  RefContext,
  RefOrigin,
  RunSnapshot,
  SlotProvenance,
  SlotRef,
} from "./types.js"

const literalOrigin = (label: string, value: unknown): RefOrigin => ({
  root: "input",
  label,
  nodeId: "",
  nodeKind: "",
  description: label,
  rootType: typeof value,
  type: typeof value,
  path: "",
})

const literal = (slot: string, kind: "const" | "inline", label: string, value: unknown): SlotProvenance => ({
  slot,
  kind,
  ref: null,
  origin: literalOrigin(label, value),
  originError: null,
  value: { value, preview: previewOf(value), lifted: false, scope: "single", nodeId: "" },
  valueError: null,
})

const fromRef = (
  slot: string,
  ref: Ref,
  ir: Ir,
  run: RunSnapshot | null,
  context: RefContext,
): SlotProvenance => {
  const origin = resolveStatic(ref, ir, context)
  const value = resolveValue(ref, ir, run, context)
  return {
    slot,
    kind: "ref",
    ref,
    origin: origin.ok ? origin.origin : null,
    originError: origin.ok ? null : origin.error,
    value: value.ok ? value.found : null,
    valueError: value.ok ? null : value.error,
  }
}

const broken = (slot: string, parsed: Extract<SlotRef, { kind: "broken" }>): SlotProvenance => ({
  slot,
  kind: "broken",
  ref: null,
  origin: null,
  originError: parsed.error,
  value: null,
  valueError: parsed.error,
})

export const resolveSlot = (
  slot: string,
  raw: unknown,
  ir: Ir,
  run: RunSnapshot | null = null,
  context: RefContext = {},
): SlotProvenance => {
  const parsed = parseSlot(raw)
  if (parsed.kind === "ref") return fromRef(slot, parsed.ref, ir, run, context)
  if (parsed.kind === "const") return literal(slot, "const", "константа", parsed.value)
  if (parsed.kind === "broken") return broken(slot, parsed)
  return literal(slot, "inline", "литерал", parsed.value)
}
