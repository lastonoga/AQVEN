import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId/")({
  beforeLoad: ({ params }) => {
    redirect({ to: "/$locale/$workspaceId/$workflowId/schema", params, throw: true })
  },
})
