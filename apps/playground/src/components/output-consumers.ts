import { parseSlot } from "../refs/index.js"
import type { Ir, IrNode } from "../api/index.js"

export type Consumer = { node: string; slot: string; path: string }

type SlotEntry = { name: string; raw: unknown }

const pseudoSlots: Record<string, readonly string[]> = {
  map: ["over"],
  switch: ["on"],
  loop: ["over"],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const recordEntries = (value: unknown, prefix: string): SlotEntry[] => {
  if (!isRecord(value)) return []
  return Object.entries(value).map(([name, raw]) => ({ name: `${prefix}${name}`, raw }))
}

const nestedEntries = (value: unknown): SlotEntry[] => {
  if (!isRecord(value)) return []
  return recordEntries(value["in"], "do.")
}

const slotEntries = (body: IrNode): SlotEntry[] => [
  ...(pseudoSlots[body.kind] ?? [])
    .filter((key) => body[key] !== undefined)
    .map((key) => ({ name: key, raw: body[key] })),
  ...recordEntries(body["in"], ""),
  ...recordEntries(body["cases"], "cases."),
  ...nestedEntries(body["do"]),
]

const consumerOf = (holder: string, entry: SlotEntry, nodeId: string): Consumer[] => {
  const slot = parseSlot(entry.raw)
  if (slot.kind !== "ref") return []
  if (slot.ref.root !== "node") return []
  if (slot.ref.node !== nodeId) return []
  return [{ node: holder, slot: entry.name, path: slot.ref.text }]
}

export const consumersOf = (ir: Ir | null, nodeId: string): Consumer[] => {
  if (ir === null) return []
  return Object.entries(ir.nodes).flatMap(([holder, body]) =>
    slotEntries(body).flatMap((entry) => consumerOf(holder, entry, nodeId)),
  )
}
