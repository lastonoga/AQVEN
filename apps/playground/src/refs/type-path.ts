import type { RefSegment } from "./types.js"

const dropArray = (type: string): string => (type.endsWith("[]") ? type.slice(0, -2) : type)

const joinType = (type: string, name: string): string => (type === "" ? name : `${type}.${name}`)

const stepType = (type: string, segment: RefSegment): string => {
  if (segment.kind === "lift") return dropArray(type)
  if (segment.kind === "index") return dropArray(type)
  return joinType(type, segment.name)
}

export const typeAlong = (rootType: string, segments: readonly RefSegment[]): string =>
  segments.reduce(stepType, rootType)

export const dropOutHead = (segments: readonly RefSegment[]): RefSegment[] => {
  const head = segments[0]
  if (head?.kind === "field" && head.name === "out") return segments.slice(1)
  return [...segments]
}
