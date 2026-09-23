import { getRouteApi } from "@tanstack/react-router"
import type { FlowId } from "@/domain"

export const ROUTE_PATH = {
  flows: "/flows",
  flow: "/flows/$flowId",
  canvas: "/flows/$flowId/canvas",
  runs: "/flows/$flowId/runs",
  cases: "/flows/$flowId/cases",
  run: "/runs/$runId",
  research: "/research",
  experiment: "/research/experiments/$experimentId",
  series: "/research/series/$seriesId",
  settings: "/settings",
  setup: "/setup",
} as const

export const ROUTE_ID = {
  project: "/_project",
  flows: "/_project/flows/",
  flow: "/_project/flows/$flowId",
  canvas: "/_project/flows/$flowId/canvas",
  runs: "/_project/flows/$flowId/runs",
  cases: "/_project/flows/$flowId/cases",
  run: "/_project/runs/$runId",
  research: "/_project/research/",
  experiment: "/_project/research/experiments/$experimentId",
  series: "/_project/research/series/$seriesId",
  settings: "/_project/settings",
  setup: "/setup",
} as const

export type FlowParams = { readonly flowId: FlowId }

export const projectRouteApi = getRouteApi(ROUTE_ID.project)
export const flowsRouteApi = getRouteApi(ROUTE_ID.flows)
export const flowRouteApi = getRouteApi(ROUTE_ID.flow)
export const canvasRouteApi = getRouteApi(ROUTE_ID.canvas)
export const runsRouteApi = getRouteApi(ROUTE_ID.runs)
export const casesRouteApi = getRouteApi(ROUTE_ID.cases)
export const runRouteApi = getRouteApi(ROUTE_ID.run)
export const researchRouteApi = getRouteApi(ROUTE_ID.research)
export const experimentRouteApi = getRouteApi(ROUTE_ID.experiment)
export const seriesRouteApi = getRouteApi(ROUTE_ID.series)
export const settingsRouteApi = getRouteApi(ROUTE_ID.settings)
export const setupRouteApi = getRouteApi(ROUTE_ID.setup)
