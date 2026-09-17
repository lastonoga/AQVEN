import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react"
import { Tag } from "@/components/studio"
import { edgeGeometry, labelTransform, type LabelPlacement } from "./edge-paths"
import { EDGE_STYLE, LABEL_TONE, type EdgeVariant } from "./edge-style"
import type { SchemaFlowEdge } from "./to-flow"

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

export function FlowEdge({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, markerEnd }: EdgeProps<SchemaFlowEdge>) {
  if (data === undefined) return null
  const geometry = edgeGeometry({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }, data)
  return (
    <>
      <BaseEdge path={geometry.path} style={EDGE_STYLE[data.variant]} interactionWidth={0} {...markerProps(markerEnd)} />
      <EdgeLabel label={data.label} placement={geometry.label} variant={data.variant} />
    </>
  )
}
