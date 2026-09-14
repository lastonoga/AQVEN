import { BaseEdge, EdgeLabelRenderer, Position, getSmoothStepPath } from "@xyflow/react"
import { BORDER_RADIUS, ROUTE_OFFSET, SOURCE_SHARE, orthoRoute } from "./edge-route.js"
import type { EdgeProps } from "@xyflow/react"
import type { EdgeAnchor, RouteGeometry, RoutePath, Side } from "./edge-route.js"
import type { WfEdge } from "./edges.js"

const SIDE: Record<Position, Side> = {
  [Position.Left]: "left",
  [Position.Right]: "right",
  [Position.Top]: "top",
  [Position.Bottom]: "bottom",
}

const HIT_WIDTH = 24

const LABEL_BG = "rgba(2,6,23,0.92)"

type Props = EdgeProps<WfEdge> & { anchor: EdgeAnchor }

const geometryOf = (props: EdgeProps<WfEdge>): RouteGeometry => ({
  source: { x: props.sourceX, y: props.sourceY },
  target: { x: props.targetX, y: props.targetY },
  sourceSide: SIDE[props.sourcePosition],
  targetSide: SIDE[props.targetPosition],
})

const smoothRoute = (props: EdgeProps<WfEdge>, anchor: EdgeAnchor): RoutePath => {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    borderRadius: BORDER_RADIUS,
    offset: ROUTE_OFFSET,
  })
  if (anchor === "center") return { path, label: { x: labelX, y: labelY } }
  const lead = props.sourceY + (props.targetY - props.sourceY) * SOURCE_SHARE
  return { path, label: { x: labelX, y: lead } }
}

export function RouteEdge({ anchor, ...props }: Props) {
  const points = props.data?.points ?? []
  const route = orthoRoute(geometryOf(props), points, anchor) ?? smoothRoute(props, anchor)
  const text = props.data?.text ?? ""
  const color = props.data?.color ?? "#64748b"

  return (
    <>
      <BaseEdge
        id={props.id}
        path={route.path}
        style={props.style}
        markerEnd={props.markerEnd}
        interactionWidth={HIT_WIDTH}
      />
      {text !== "" && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan rounded border px-1.5 py-0.5 font-mono text-[9.5px] leading-none"
            title={props.data?.title}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${route.label.x}px, ${route.label.y}px)`,
              pointerEvents: "all",
              borderColor: color,
              color,
              background: LABEL_BG,
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
