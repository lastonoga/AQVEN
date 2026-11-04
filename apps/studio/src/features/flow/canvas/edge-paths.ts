import type { Point } from "../layout"

export type LabelAlign = "above" | "center"
export type LabelPlacement = { readonly x: number; readonly y: number; readonly align: LabelAlign }
export type EdgeGeometry = { readonly path: string; readonly label: LabelPlacement }

const CORNER_RADIUS = 12

const LABEL_SHIFT: Readonly<Record<LabelAlign, string>> = {
  above: "translate(0, -100%)",
  center: "translate(-50%, -50%)",
}

const roundedCorner = (prev: Point, corner: Point, next: Point, radius: number): string => {
  const inLen = Math.hypot(corner.x - prev.x, corner.y - prev.y)
  const outLen = Math.hypot(next.x - corner.x, next.y - corner.y)
  const cut = Math.min(radius, inLen / 2, outLen / 2)
  if (cut < 1) return ` L ${String(corner.x)} ${String(corner.y)}`
  const before = { x: corner.x - ((corner.x - prev.x) / inLen) * cut, y: corner.y - ((corner.y - prev.y) / inLen) * cut }
  const after = { x: corner.x + ((next.x - corner.x) / outLen) * cut, y: corner.y + ((next.y - corner.y) / outLen) * cut }
  return ` L ${String(before.x)} ${String(before.y)} Q ${String(corner.x)} ${String(corner.y)} ${String(after.x)} ${String(after.y)}`
}

export const pointsPath = (points: readonly Point[], radius = CORNER_RADIUS): string => {
  const first = points.at(0)
  if (first === undefined) return ""
  const head = `M ${String(first.x)} ${String(first.y)}`
  const last = points.at(-1)
  if (last === undefined || points.length < 2) return head
  const bends = points.slice(1, -1).map((corner, index) => roundedCorner(points[index] ?? corner, corner, points[index + 2] ?? corner, radius))
  return `${head}${bends.join("")} L ${String(last.x)} ${String(last.y)}`
}

const midpointOf = (points: readonly Point[]): Point => {
  const middle = Math.floor((points.length - 1) / 2)
  const a = points[middle] ?? { x: 0, y: 0 }
  const b = points[middle + 1] ?? a
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

export const pointsGeometry = (points: readonly Point[], variant: "flow" | "back"): EdgeGeometry => {
  const middle = midpointOf(points)
  return { path: pointsPath(points), label: { x: middle.x, y: middle.y - (variant === "flow" ? 8 : 0), align: variant === "flow" ? "above" : "center" } }
}

export const labelTransform = ({ x, y, align }: LabelPlacement): string => `translate(${String(x)}px, ${String(y)}px) ${LABEL_SHIFT[align]}`
