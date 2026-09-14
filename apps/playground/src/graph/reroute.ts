import { NODE_SEP, RANK_SEP } from "./metrics.js"
import type { Point, Rect } from "./metrics.js"

const LANE = RANK_SEP / 2
const TOUCH = 0.5

const slab = (from: number, span: number, low: number, high: number): [number, number] => {
  if (span === 0) return from >= low && from <= high ? [0, 1] : [1, 0]
  const first = (low - from) / span
  const second = (high - from) / span
  return first <= second ? [first, second] : [second, first]
}

export const clips = (from: Point, to: Point, box: Rect): boolean => {
  const width = box.width - TOUCH * 2
  const height = box.height - TOUCH * 2
  if (width <= 0 || height <= 0) return false
  const [minX, maxX] = slab(from.x, to.x - from.x, box.x + TOUCH, box.x + TOUCH + width)
  const [minY, maxY] = slab(from.y, to.y - from.y, box.y + TOUCH, box.y + TOUCH + height)
  return Math.max(0, minX, minY) < Math.min(1, maxX, maxY)
}

export const clean = (path: readonly Point[], boxes: readonly Rect[]): boolean =>
  !path.some((point, index) => {
    const next = path[index + 1]
    return next !== undefined && boxes.some((box) => clips(point, next, box))
  })

const detour = (start: Point, end: Point, lane: number): Point[] => [
  start,
  { x: start.x + LANE, y: start.y },
  { x: start.x + LANE, y: lane },
  { x: end.x - LANE, y: lane },
  { x: end.x - LANE, y: end.y },
  end,
]

export const bypass = (path: readonly Point[], boxes: readonly Rect[]): Point[] => {
  if (clean(path, boxes)) return [...path]
  const start = path[0]
  const end = path[path.length - 1]
  if (start === undefined || end === undefined) return [...path]
  const band = boxes.filter(
    (box) =>
      box.x <= Math.max(start.x, end.x) + LANE && box.x + box.width >= Math.min(start.x, end.x) - LANE,
  )
  const above = Math.min(start.y, end.y, ...band.map((box) => box.y)) - NODE_SEP
  const below = Math.max(start.y, end.y, ...band.map((box) => box.y + box.height)) + NODE_SEP
  const tried = [detour(start, end, above), detour(start, end, below)]
  return tried.find((candidate) => clean(candidate, boxes)) ?? [...path]
}
