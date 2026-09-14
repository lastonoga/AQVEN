import { RouteEdge } from "./RouteEdge.js"
import type { EdgeProps } from "@xyflow/react"
import type { WfEdge } from "./edges.js"

export function BranchEdge(props: EdgeProps<WfEdge>) {
  return <RouteEdge {...props} anchor="source" />
}
