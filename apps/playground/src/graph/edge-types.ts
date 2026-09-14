import { BranchEdge } from "./BranchEdge.js"
import { OrthoEdge } from "./OrthoEdge.js"
import type { DefaultEdgeOptions, EdgeTypes } from "@xyflow/react"

export const edgeTypes: EdgeTypes = { ortho: OrthoEdge, branch: BranchEdge }

export const defaultEdgeOptions: DefaultEdgeOptions = { zIndex: 2, interactionWidth: 24 }
