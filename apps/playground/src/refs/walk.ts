import { isRecord } from "./guards.js"
import type { RefSegment } from "./types.js"

const stepField = (value: unknown, name: string): unknown => {
  if (Array.isArray(value)) return value.map((entry) => stepField(entry, name))
  if (!isRecord(value)) return undefined
  return value[name]
}

const stepLift = (value: unknown): unknown => (Array.isArray(value) ? value.flat() : [])

const stepIndex = (value: unknown, index: number): unknown =>
  Array.isArray(value) ? value[index] : undefined

export const stepInto = (value: unknown, segment: RefSegment): unknown => {
  if (segment.kind === "lift") return stepLift(value)
  if (segment.kind === "index") return stepIndex(value, segment.index)
  return stepField(value, segment.name)
}

export const walk = (value: unknown, segments: readonly RefSegment[]): unknown =>
  segments.reduce(stepInto, value)
