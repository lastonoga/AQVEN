import { getRouteApi } from "@tanstack/react-router"
import type { Locale, WorkflowId, WorkspaceId } from "@/domain"

export const ROUTE_PATH = {
  shell: "/$locale/$workspaceId/$workflowId",
  schema: "/$locale/$workspaceId/$workflowId/schema",
  dataflow: "/$locale/$workspaceId/$workflowId/dataflow",
  nodes: "/$locale/$workspaceId/$workflowId/nodes",
  tests: "/$locale/$workspaceId/$workflowId/tests",
  testDetail: "/$locale/$workspaceId/$workflowId/tests/$testId",
  review: "/$locale/$workspaceId/$workflowId/review",
  setup: "/$locale/setup",
  settings: "/$locale/settings",
} as const

export const ROUTE_ID = { ...ROUTE_PATH, tests: "/$locale/$workspaceId/$workflowId/tests/" } as const

export type WorkflowParams = {
  readonly locale: Locale
  readonly workspaceId: WorkspaceId
  readonly workflowId: WorkflowId
}

export const shellRouteApi = getRouteApi(ROUTE_ID.shell)
export const schemaRouteApi = getRouteApi(ROUTE_ID.schema)
export const dataflowRouteApi = getRouteApi(ROUTE_ID.dataflow)
export const nodesRouteApi = getRouteApi(ROUTE_ID.nodes)
export const testsRouteApi = getRouteApi(ROUTE_ID.tests)
export const testDetailRouteApi = getRouteApi(ROUTE_ID.testDetail)
export const reviewRouteApi = getRouteApi(ROUTE_ID.review)
export const setupRouteApi = getRouteApi(ROUTE_ID.setup)
export const settingsRouteApi = getRouteApi(ROUTE_ID.settings)
