import { getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import type { EdgeVariant } from "../layout"
import type { FlowEdgeData } from "./edge-style"

export type EdgeEndpoints = Pick<EdgeProps, "sourceX" | "sourceY" | "sourcePosition" | "targetX" | "targetY" | "targetPosition">
export type LabelAlign = "above" | "center"
export type LabelPlacement = { readonly x: number; readonly y: number; readonly align: LabelAlign }
export type EdgeGeometry = { readonly path: string; readonly label: LabelPlacement }

type GeometryBuilders = { readonly [K in EdgeVariant]: (ends: EdgeEndpoints, data: FlowEdgeData<K>) => EdgeGeometry }

const FLOW_RADIUS = 14
const BACK_RADIUS = 16
const DEFAULT_DETOUR = 48
const LABEL_OFFSET_X = 40
const LABEL_GAP_Y = 11

const LABEL_SHIFT: Readonly<Record<LabelAlign, string>> = {
  above: "translate(0, -100%)",
  center: "translate(-50%, -50%)",
}

export const uPath = (sourceX: number, sourceY: number, targetX: number, targetY: number, detourY: number, radius: number): string => {
  const leftward = targetX < sourceX
  const step = leftward ? -radius : radius
  const sweep = leftward ? 1 : 0
  return [
    "M", sourceX, sourceY,
    "L", sourceX, detourY - radius,
    "A", radius, radius, 0, 0, sweep, sourceX + step, detourY,
    "L", targetX - step, detourY,
    "A", radius, radius, 0, 0, sweep, targetX, detourY - radius,
    "L", targetX, targetY,
  ].join(" ")
}

const detourOf = (ends: EdgeEndpoints, detourY: number | null): number => detourY ?? Math.max(ends.sourceY, ends.targetY) + DEFAULT_DETOUR

const GEOMETRY: GeometryBuilders = {
  flow: (ends) => {
    const [path] = getSmoothStepPath({ ...ends, borderRadius: FLOW_RADIUS })
    return { path, label: { x: ends.sourceX + LABEL_OFFSET_X, y: ends.targetY - LABEL_GAP_Y, align: "above" } }
  },
  back: (ends, data) => {
    const detourY = detourOf(ends, data.detourY)
    return {
      path: uPath(ends.sourceX, ends.sourceY, ends.targetX, ends.targetY, detourY, BACK_RADIUS),
      label: { x: (ends.sourceX + ends.targetX) / 2, y: detourY, align: "center" },
    }
  },
}

export const edgeGeometry = <K extends EdgeVariant>(ends: EdgeEndpoints, data: FlowEdgeData<K>): EdgeGeometry => {
  const build: (ends: EdgeEndpoints, data: FlowEdgeData<K>) => EdgeGeometry = GEOMETRY[data.variant]
  return build(ends, data)
}

export const labelTransform = ({ x, y, align }: LabelPlacement): string => `translate(${String(x)}px, ${String(y)}px) ${LABEL_SHIFT[align]}`
