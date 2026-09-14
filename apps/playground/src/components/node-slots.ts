import { isRecord, parseSlotValue } from "./ir-value.js"
import type { Slot } from "./ir-value.js"
import type { IrNode } from "../api/index.js"

const pseudoSlots: Record<string, readonly string[]> = {
  map: ["over"],
  switch: ["on"],
  loop: ["over"],
}

const slotsFromIn = (body: IrNode, known: ReadonlySet<string>): Slot[] => {
  const slots = body["in"]
  if (!isRecord(slots)) return []
  return Object.entries(slots).map(([name, value]) => ({ name, source: parseSlotValue(value, known), raw: value }))
}

const slotsFromPseudo = (body: IrNode, known: ReadonlySet<string>): Slot[] =>
  (pseudoSlots[body.kind] ?? [])
    .filter((key) => body[key] !== undefined)
    .map((key) => ({ name: key, source: parseSlotValue(body[key], known), raw: body[key] }))

export const nodeSlots = (body: IrNode, known: ReadonlySet<string>): Slot[] => [
  ...slotsFromPseudo(body, known),
  ...slotsFromIn(body, known),
]

export const caseSlots = (body: IrNode, known: ReadonlySet<string>): Slot[] => {
  const cases = body["cases"]
  if (!isRecord(cases)) return []
  return Object.entries(cases).map(([name, value]) => ({ name, source: parseSlotValue(value, known), raw: value }))
}
