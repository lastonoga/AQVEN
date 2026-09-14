import { RouteEdge } from "./RouteEdge.js"
import type { EdgeProps } from "@xyflow/react"
import type { WfEdge } from "./edges.js"

export function OrthoEdge(props: EdgeProps<WfEdge>) {
  return <RouteEdge {...props} anchor="center" />
}
