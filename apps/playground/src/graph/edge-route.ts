export type Point = { x: number; y: number }

export type Side = "left" | "right" | "top" | "bottom"

export type RouteGeometry = {
  source: Point
  target: Point
  sourceSide: Side
  targetSide: Side
}

export type RoutePath = { path: string; label: Point }

export type EdgeAnchor = "center" | "source"

export const BORDER_RADIUS = 8
export const ROUTE_OFFSET = 24
export const LABEL_LEAD = 42
export const SOURCE_SHARE = 0.35

const EPSILON = 0.5
const TRIM = 26
const LEAD_SHARE = 0.4
const HALF = 0.5

const STEP: Record<Side, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
}

const near = (left: number, right: number): boolean => Math.abs(left - right) < EPSILON

const samePoint = (left: Point, right: Point): boolean => near(left.x, right.x) && near(left.y, right.y)

const span = (from: Point, to: Point): number => Math.hypot(to.x - from.x, to.y - from.y)

const round = (value: number): number => Math.round(value * 100) / 100

export const stubPoint = (point: Point, side: Side, distance: number): Point => {
  const step = STEP[side]
  return { x: point.x + step.x * distance, y: point.y + step.y * distance }
}

const elbow = (from: Point, to: Point): Point[] => {
  if (near(from.x, to.x) || near(from.y, to.y)) return [to]
  return [{ x: to.x, y: from.y }, to]
}

const squared = (points: readonly Point[]): Point[] =>
  points.reduce<Point[]>((chain, point) => {
    const last = chain[chain.length - 1]
    if (last === undefined) return [point]
    return [...chain, ...elbow(last, point)]
  }, [])

const collinear = (before: Point, at: Point, after: Point): boolean =>
  (near(before.x, at.x) && near(at.x, after.x)) || (near(before.y, at.y) && near(at.y, after.y))

const simplify = (points: readonly Point[]): Point[] =>
  points.reduce<Point[]>((chain, point) => {
    const last = chain[chain.length - 1]
    if (last === undefined) return [point]
    if (samePoint(last, point)) return chain
    const before = chain[chain.length - 2]
    if (before !== undefined && collinear(before, last, point)) return [...chain.slice(0, -1), point]
    return [...chain, point]
  }, [])

const lerp = (from: Point, to: Point, distance: number): Point => {
  const length = span(from, to)
  if (length === 0) return { ...to }
  const ratio = Math.min(distance, length) / length
  return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
}

export const chainLength = (points: readonly Point[]): number =>
  points.slice(1).reduce((total, point, index) => {
    const previous = points[index]
    if (previous === undefined) return total
    return total + span(previous, point)
  }, 0)

export const walk = (points: readonly Point[], distance: number): Point => {
  const head = points[0] ?? { x: 0, y: 0 }
  let left = Math.max(distance, 0)
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (from === undefined || to === undefined) break
    const length = span(from, to)
    if (left <= length) return lerp(from, to, left)
    left -= length
  }
  return points[points.length - 1] ?? head
}

export const anchorOf = (points: readonly Point[], anchor: EdgeAnchor): Point => {
  const total = chainLength(points)
  if (anchor === "center") return walk(points, total * HALF)
  return walk(points, Math.min(LABEL_LEAD, total * LEAD_SHARE))
}

const corner = (before: Point, at: Point, after: Point): string => {
  const radius = Math.min(BORDER_RADIUS, span(before, at) * HALF, span(at, after) * HALF)
  const entry = lerp(at, before, radius)
  const exit = lerp(at, after, radius)
  return `L ${round(entry.x)},${round(entry.y)} Q ${round(at.x)},${round(at.y)} ${round(exit.x)},${round(exit.y)}`
}

export const roundedPath = (points: readonly Point[]): string => {
  const head = points[0]
  const tail = points[points.length - 1]
  if (head === undefined || tail === undefined) return ""
  const turns = points.slice(1, -1).flatMap((point, index) => {
    const before = points[index]
    const after = points[index + 2]
    if (before === undefined || after === undefined) return []
    return [corner(before, point, after)]
  })
  return [`M ${round(head.x)},${round(head.y)}`, ...turns, `L ${round(tail.x)},${round(tail.y)}`].join(" ")
}

const usable = (geometry: RouteGeometry, point: Point): boolean =>
  span(point, geometry.source) > TRIM && span(point, geometry.target) > TRIM

export const routeChain = (geometry: RouteGeometry, points: readonly Point[]): Point[] => {
  const inner = points.filter((point) => usable(geometry, point))
  if (inner.length === 0) return []
  return simplify(
    squared([
      geometry.source,
      stubPoint(geometry.source, geometry.sourceSide, ROUTE_OFFSET),
      ...inner,
      stubPoint(geometry.target, geometry.targetSide, ROUTE_OFFSET),
      geometry.target,
    ]),
  )
}

export const orthoRoute = (
  geometry: RouteGeometry,
  points: readonly Point[],
  anchor: EdgeAnchor,
): RoutePath | null => {
  const chain = routeChain(geometry, points)
  if (chain.length < 3) return null
  return { path: roundedPath(chain), label: anchorOf(chain, anchor) }
}
