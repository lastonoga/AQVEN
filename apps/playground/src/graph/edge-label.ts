import { ROUTE_OFFSET, chainLength, routeChain, simplify } from "./edge-route.js"
import { GROUP_HEADER, overlaps } from "./layout.js"
import type { EdgeAnchor, Point, RouteGeometry } from "./edge-route.js"
import type { Rect, Size } from "./layout.js"

export const LABEL_CHAR = 5.7
export const LABEL_PAD_X = 6
export const LABEL_PAD_Y = 3
export const LABEL_BORDER = 1
export const LABEL_TEXT = 10
export const LABEL_GAP = 6
export const LABEL_MAX_CHARS = 18
export const LABEL_HEIGHT = LABEL_TEXT + LABEL_PAD_Y * 2 + LABEL_BORDER * 2
export const LABEL_RING = LABEL_HEIGHT + LABEL_GAP
export const LABEL_RINGS = 2
export const FRAME_BAND = 4

const CORNER = 12
const STEP = 12
const MIN_SEGMENT = CORNER * 2 + 2
const HALF = 0.5
const LEAD = 42
const SIDES: readonly number[] = [-1, 1]

export type LabelTarget = {
  id: string
  text: string
  anchor: EdgeAnchor
  chain: readonly Point[]
}

export const labelSize = (text: string): Size => ({
  width: Math.min(text.length, LABEL_MAX_CHARS) * LABEL_CHAR + LABEL_PAD_X * 2 + LABEL_BORDER * 2,
  height: LABEL_HEIGHT,
})

export const labelRect = (center: Point, text: string): Rect => {
  const size = labelSize(text)
  return { x: center.x - size.width * HALF, y: center.y - size.height * HALF, ...size }
}

export const frameBoxes = (rect: Rect): Rect[] => [
  { x: rect.x, y: rect.y, width: rect.width, height: GROUP_HEADER },
  { x: rect.x, y: rect.y, width: FRAME_BAND, height: rect.height },
  { x: rect.x + rect.width - FRAME_BAND, y: rect.y, width: FRAME_BAND, height: rect.height },
  { x: rect.x, y: rect.y + rect.height - FRAME_BAND, width: rect.width, height: FRAME_BAND },
]

export const labelObstacles = (
  rects: ReadonlyMap<string, Rect>,
  frames: ReadonlySet<string>,
): Rect[] => [...rects].flatMap(([id, rect]) => (frames.has(id) ? frameBoxes(rect) : [rect]))

export const smoothStepChain = (source: Point, target: Point): Point[] => {
  const left = { x: source.x + ROUTE_OFFSET, y: source.y }
  const right = { x: target.x - ROUTE_OFFSET, y: target.y }
  if (left.x < right.x) {
    const middle = (left.x + right.x) * HALF
    return [source, left, { x: middle, y: left.y }, { x: middle, y: right.y }, right, target]
  }
  const middle = (left.y + right.y) * HALF
  return [source, left, { x: left.x, y: middle }, { x: right.x, y: middle }, right, target]
}

export const edgeChain = (source: Rect, target: Rect, points: readonly Point[]): Point[] => {
  const geometry: RouteGeometry = {
    source: { x: source.x + source.width, y: source.y + source.height * HALF },
    target: { x: target.x, y: target.y + target.height * HALF },
    sourceSide: "right",
    targetSide: "left",
  }
  const chain = routeChain(geometry, points)
  if (chain.length >= 3) return chain
  return simplify(smoothStepChain(geometry.source, geometry.target))
}

type Segment = { from: Point; to: Point; start: number; length: number }

const segmentsOf = (points: readonly Point[]): Segment[] =>
  points.slice(1).reduce<Segment[]>((chain, to, index) => {
    const from = points[index]
    if (from === undefined) return chain
    const last = chain[chain.length - 1]
    const start = last === undefined ? 0 : last.start + last.length
    return [...chain, { from, to, start, length: Math.hypot(to.x - from.x, to.y - from.y) }]
  }, [])

const isFlat = (segment: Segment): boolean =>
  Math.abs(segment.to.y - segment.from.y) <= Math.abs(segment.to.x - segment.from.x)

const along = (segment: Segment, distance: number): Point => {
  const ratio = segment.length === 0 ? 0 : distance / segment.length
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
    y: segment.from.y + (segment.to.y - segment.from.y) * ratio,
  }
}

const ticks = (length: number): number[] => {
  const last = length - CORNER
  if (last < CORNER) return []
  return Array.from({ length: Math.floor((last - CORNER) / STEP) + 1 }, (_, index) => CORNER + index * STEP)
}

type Spot = { point: Point; distance: number; flat: boolean }

const spotsOf = (segments: readonly Segment[], skip: number): Spot[] =>
  segments.flatMap((segment, index) => {
    if (index < skip || segment.length < MIN_SEGMENT) return []
    return ticks(segment.length).map((offset) => ({
      point: along(segment, offset),
      distance: segment.start + offset,
      flat: isFlat(segment),
    }))
  })

const beside = (spot: Spot, size: Size, side: number, ring: number): Point => {
  const reach = (spot.flat ? size.height : size.width) * HALF + LABEL_GAP + ring * LABEL_RING
  if (spot.flat) return { x: spot.point.x, y: spot.point.y + side * reach }
  return { x: spot.point.x + side * reach, y: spot.point.y }
}

const clear = (rect: Rect, obstacles: readonly Rect[], taken: readonly Rect[]): boolean =>
  !obstacles.some((box) => overlaps(rect, box)) && !taken.some((box) => overlaps(rect, box))

const preferredOf = (total: number, anchor: EdgeAnchor): number =>
  anchor === "center" ? total * HALF : Math.min(LEAD, total * HALF)

const ranked = (chain: readonly Point[], anchor: EdgeAnchor, skip: number): Spot[] => {
  const preferred = preferredOf(chainLength(chain), anchor)
  return spotsOf(segmentsOf(chain), skip).sort(
    (left, right) => Math.abs(left.distance - preferred) - Math.abs(right.distance - preferred),
  )
}

const centresOf = (spots: readonly Spot[], size: Size): Point[] => {
  const rings = Array.from({ length: LABEL_RINGS }, (_, index) => index)
  return rings.flatMap((ring) =>
    spots.flatMap((spot) => SIDES.map((side) => beside(spot, size, side, ring))),
  )
}

const passesOf = (chain: readonly Point[], anchor: EdgeAnchor): number[] => {
  if (anchor === "center") return [0]
  return segmentsOf(chain).length >= 3 ? [1, 0] : [0]
}

export const placeLabel = (
  target: LabelTarget,
  obstacles: readonly Rect[],
  taken: readonly Rect[],
): Point | null => {
  const size = labelSize(target.text)
  const tries = passesOf(target.chain, target.anchor).flatMap((skip) =>
    centresOf(ranked(target.chain, target.anchor, skip), size),
  )
  return tries.find((center) => clear(labelRect(center, target.text), obstacles, taken)) ?? null
}

export const placeLabels = (
  targets: readonly LabelTarget[],
  obstacles: readonly Rect[],
): Map<string, Point | null> => {
  const taken: Rect[] = []
  const spots = new Map<string, Point | null>()
  for (const target of targets) {
    const center = placeLabel(target, obstacles, taken)
    spots.set(target.id, center)
    if (center !== null) taken.push(labelRect(center, target.text))
  }
  return spots
}
