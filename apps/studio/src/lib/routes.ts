import { getRouteApi } from "@tanstack/react-router"
import type { FlowId } from "@/domain"

export const ROUTE_PATH = {
  flow: "/flows/$flowId",
  canvas: "/flows/$flowId/canvas",
  nodes: "/flows/$flowId/nodes",
  runs: "/flows/$flowId/runs",
  datasets: "/flows/$flowId/datasets",
  review: "/flows/$flowId/review",
  evals: "/flows/$flowId/evals",
  project: "/project",
  settings: "/settings",
  setup: "/setup",
} as const

export const ROUTE_ID = ROUTE_PATH

export type FlowParams = { readonly flowId: FlowId }

export const flowRouteApi = getRouteApi(ROUTE_ID.flow)
export const canvasRouteApi = getRouteApi(ROUTE_ID.canvas)
export const nodesRouteApi = getRouteApi(ROUTE_ID.nodes)
export const runsRouteApi = getRouteApi(ROUTE_ID.runs)
export const datasetsRouteApi = getRouteApi(ROUTE_ID.datasets)
export const reviewRouteApi = getRouteApi(ROUTE_ID.review)
export const evalsRouteApi = getRouteApi(ROUTE_ID.evals)
export const projectRouteApi = getRouteApi(ROUTE_ID.project)
export const settingsRouteApi = getRouteApi(ROUTE_ID.settings)
export const setupRouteApi = getRouteApi(ROUTE_ID.setup)
