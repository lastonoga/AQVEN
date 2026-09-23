import { use } from "react"
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react"
import { Tag } from "@/components/studio"
import { edgeGeometry, labelTransform, type LabelPlacement } from "./edge-paths"
import type { EdgeVariant } from "../layout"
import { edgeStyle, LABEL_TONE } from "./edge-style"
import { HoveredNodeContext, SelectedNodeContext } from "./selection"
import type { CanvasFlowEdge } from "./to-flow"

type EdgeLabelProps = { readonly label: string | null; readonly placement: LabelPlacement; readonly variant: EdgeVariant }

function EdgeLabel({ label, placement, variant }: EdgeLabelProps) {
  if (label === null) return null
  return (
    <EdgeLabelRenderer>
      <Tag size="edge" fill="ground" tone={LABEL_TONE[variant]} className="absolute top-0 left-0 z-10" style={{ transform: labelTransform(placement) }}>
        {label}
      </Tag>
    </EdgeLabelRenderer>
  )
}

const markerProps = (markerEnd: string | undefined): { readonly markerEnd?: string } => (markerEnd === undefined ? {} : { markerEnd })

const DIMMED_OPACITY = 0.18
const DOT_RADIUS = 2.6
const DOT_MIN_DURATION = 2.1
const DOT_DURATION_STEP = 0.37
const DOT_STAGGER = 0.42
const HASH_MODULUS = 97
const HASH_MULTIPLIER = 31

type DotTiming = { readonly dur: string; readonly begin: string }

const hashOf = (value: string): number => Array.from(value).reduce((hash, char) => (hash * HASH_MULTIPLIER + char.charCodeAt(0)) % HASH_MODULUS, 0)

const dotTiming = (edgeId: string): DotTiming => {
  const hash = hashOf(edgeId)
  return {
    dur: `${(DOT_MIN_DURATION + (hash % 5) * DOT_DURATION_STEP).toFixed(2)}s`,
    begin: `${((hash % 7) * DOT_STAGGER).toFixed(2)}s`,
  }
}

export function FlowEdge({ id, source, target, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd }: EdgeProps<CanvasFlowEdge>) {
  const selected = use(SelectedNodeContext)
  const hovered = use(HoveredNodeContext)
  if (data === undefined) return null
  const geometry = edgeGeometry({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }, data)
  const traced = hovered ?? selected
  const related = traced === null || traced === source || traced === target
  const timing = dotTiming(id)
  return (
    <>
      <BaseEdge
        path={geometry.path}
        style={{ ...edgeStyle(data.variant, data.color), opacity: related ? 1 : DIMMED_OPACITY }}
        interactionWidth={0}
        {...markerProps(related ? markerEnd : undefined)}
      />
      {related ? (
        <circle r={DOT_RADIUS} fill={data.color} className="flow-dot">
          <animateMotion dur={timing.dur} begin={timing.begin} repeatCount="indefinite" path={geometry.path} />
        </circle>
      ) : null}
      <EdgeLabel label={data.label} placement={geometry.label} variant={data.variant} />
    </>
  )
}
