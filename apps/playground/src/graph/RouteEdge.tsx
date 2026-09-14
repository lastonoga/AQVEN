import { useState } from "react"
import { BaseEdge, EdgeLabelRenderer, Position, getSmoothStepPath } from "@xyflow/react"
import { BORDER_RADIUS, ROUTE_OFFSET, SOURCE_SHARE, orthoRoute } from "./edge-route.js"
import { LABEL_PAD_X, LABEL_PAD_Y, LABEL_TEXT, labelSize } from "./edge-label.js"
import type { EdgeProps } from "@xyflow/react"
import type { Placed } from "./edge-label.js"
import type { EdgeAnchor, Point, RouteGeometry, RoutePath, Side } from "./edge-route.js"
import type { WfEdge } from "./edges.js"

const SIDE: Record<Position, Side> = {
  [Position.Left]: "left",
  [Position.Right]: "right",
  [Position.Top]: "top",
  [Position.Bottom]: "bottom",
}

const HIT_WIDTH = 24

const LEADER_MIN = 4

const LABEL_BG = "var(--xy-background-color, var(--xy-background-color-default, #020617))"

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

const spotOf = (placed: Placed | null | undefined, fallback: Point): Placed | null => {
  if (placed === undefined) return { center: fallback, anchor: fallback }
  return placed
}

const hintOf = (text: string, title: string | undefined): string =>
  [text, title ?? ""].filter((part) => part !== "").join(" · ")

const far = (from: Point, to: Point): boolean => Math.hypot(to.x - from.x, to.y - from.y) > LEADER_MIN

function Leader({ from, to, color }: { from: Point; to: Point; color: string }) {
  if (!far(from, to)) return null
  return (
    <g>
      <path
        d={`M ${from.x},${from.y} L ${to.x},${to.y}`}
        stroke={color}
        strokeWidth={1}
        strokeDasharray="2 3"
        fill="none"
        opacity={0.75}
      />
      <circle cx={from.x} cy={from.y} r={2.5} fill={color} />
    </g>
  )
}

export function RouteEdge({ anchor, ...props }: Props) {
  const [open, setOpen] = useState(false)
  const points = props.data?.points ?? []
  const route = orthoRoute(geometryOf(props), points, anchor) ?? smoothRoute(props, anchor)
  const text = props.data?.text ?? ""
  const color = props.data?.color ?? "#64748b"
  const spot = spotOf(props.data?.label, route.label)
  const size = labelSize(text)
  const hint = hintOf(text, props.data?.title)

  return (
    <>
      <BaseEdge
        id={props.id}
        path={route.path}
        style={props.style}
        markerEnd={props.markerEnd}
        interactionWidth={HIT_WIDTH}
      />
      {text !== "" && spot !== null && (
        <>
          <Leader from={spot.anchor} to={spot.center} color={color} />
          <EdgeLabelRenderer>
            <div
              className="nodrag nopan overflow-hidden rounded border text-center font-mono"
              title={hint}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${spot.center.x}px, ${spot.center.y}px)`,
                pointerEvents: "all",
                boxSizing: "border-box",
                width: size.width,
                height: size.height,
                paddingInline: LABEL_PAD_X,
                paddingBlock: LABEL_PAD_Y,
                fontSize: LABEL_TEXT,
                lineHeight: `${LABEL_TEXT}px`,
                borderColor: color,
                color,
                background: LABEL_BG,
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                cursor: "help",
              }}
            >
              {text}
            </div>
            {open && (
              <div
                className="nodrag nopan pointer-events-none rounded border px-2 py-1 font-mono shadow-xl"
                style={{
                  position: "absolute",
                  transform: `translate(-50%, -100%) translate(${spot.center.x}px, ${spot.center.y - size.height}px)`,
                  zIndex: 1000,
                  maxWidth: 420,
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  lineHeight: "16px",
                  borderColor: color,
                  color: "#e2e8f0",
                  background: LABEL_BG,
                }}
              >
                {hint}
              </div>
            )}
          </EdgeLabelRenderer>
        </>
      )}
    </>
  )
}
