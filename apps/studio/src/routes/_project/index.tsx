import { createFileRoute, redirect } from "@tanstack/react-router"
import { EmptyProject } from "@/features/shell"
import { rememberedFlow } from "@/lib/last-flow"
import { landingFlow } from "@/lib/landing"
import { ROUTE_PATH } from "@/lib/routes"

export const Route = createFileRoute("/_project/")({
  loader: async ({ context: { api } }) => {
    const [project, flows] = await Promise.all([api.project.info(), api.project.flows()])
    const landing = landingFlow(flows, rememberedFlow(project.root))
    if (landing.kind === "flow") throw redirect({ to: ROUTE_PATH.canvas, params: { flowId: landing.flowId }, replace: true })
    return null
  },
  component: EmptyProject,
})
