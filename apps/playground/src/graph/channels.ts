import { EDGE_SEP, RANK_PAD } from "./metrics.js"
import type { Point, Rect } from "./metrics.js"

const STRAIGHT = 1.5
const MIN_GAP = 48
const SHIFTS = 6
const HALF = 0.5

export type Wire = { id: string; source: Rect; target: Rect }

type Port = { start: Point; end: Point }

type Slot = { x: number; from: number; to: number }

const portOf = (wire: Wire): Port => ({
  start: { x: wire.source.x + wire.source.width, y: wire.source.y + wire.source.height * HALF },
  end: { x: wire.target.x, y: wire.target.y + wire.target.height * HALF },
})

const spans = (port: Port): boolean => port.end.x - port.start.x >= MIN_GAP

const midX = (port: Port): number => (port.start.x + port.end.x) * HALF

const packed = (values: readonly number[]): number[][] =>
  [...values]
    .sort((left, right) => left - right)
    .reduce<number[][]>((packs, value) => {
      const pack = packs[packs.length - 1]
      const last = pack?.[pack.length - 1]
      if (pack === undefined || last === undefined || value - last > RANK_PAD) return [...packs, [value]]
      return [...packs.slice(0, -1), [...pack, value]]
    }, [])

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length

export const lanesOf = (values: readonly number[]): number[] => packed(values).map(mean)

export const nearestLane = (lanes: readonly number[], value: number): number =>
  lanes.reduce((best, lane) => (Math.abs(lane - value) < Math.abs(best - value) ? lane : best), value)

const shifts: readonly number[] = [
  0,
  ...Array.from({ length: SHIFTS }, (_, index) => (index + 1) * EDGE_SEP).flatMap((step) => [step, -step]),
]

const slotAt = (x: number, port: Port): Slot => ({
  x,
  from: Math.min(port.start.y, port.end.y),
  to: Math.max(port.start.y, port.end.y),
})

const free = (taken: readonly Slot[], slot: Slot): boolean =>
  !taken.some((other) => Math.abs(other.x - slot.x) < 1 && other.from < slot.to && slot.from < other.to)

const laneFor = (taken: readonly Slot[], x: number, port: Port): Slot => {
  const options = shifts.map((shift) => slotAt(x + shift, port))
  return options.find((slot) => free(taken, slot)) ?? slotAt(x, port)
}

const bend = (port: Port, x: number): Point[] => [
  port.start,
  { x, y: port.start.y },
  { x, y: port.end.y },
  port.end,
]

const level = (port: Port): boolean => Math.abs(port.start.y - port.end.y) < STRAIGHT

export const channelRoutes = (wires: readonly Wire[]): Map<string, Point[]> => {
  const ports = wires.map((wire) => [wire.id, portOf(wire)] as const).filter(([, port]) => spans(port))
  const lanes = lanesOf(ports.filter(([, port]) => !level(port)).map(([, port]) => midX(port)))
  const taken: Slot[] = []
  const routes = new Map<string, Point[]>()

  for (const [id, port] of ports) {
    if (level(port)) {
      routes.set(id, [port.start, port.end])
      continue
    }
    const slot = laneFor(taken, nearestLane(lanes, midX(port)), port)
    taken.push(slot)
    routes.set(id, bend(port, slot.x))
  }
  return routes
}
