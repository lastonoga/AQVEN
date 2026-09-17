import { createFileRoute } from "@tanstack/react-router"
import { TestsScreen } from "@/features/tests"

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/tests/")({
  loader: async ({ context: { sources }, params }) => ({ overview: await sources.tests.overview(params) }),
  component: TestsScreen,
})
