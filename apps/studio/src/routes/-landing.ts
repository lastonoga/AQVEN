import { redirect } from "@tanstack/react-router"
import type { RouterContext } from "@/router"
import { landingFlow } from "@/lib/landing"
import { ROUTE_PATH } from "@/lib/routes"

const projectRedirect = (): never => {
  throw redirect({ to: ROUTE_PATH.project })
}

export const redirectToLanding = async ({ api }: RouterContext): Promise<never> => {
  const flows = await api.project.flows().catch(() => null)
  if (flows === null) return projectRedirect()
  const landing = landingFlow(flows)
  if (landing.kind === "project") return projectRedirect()
  throw redirect({ to: ROUTE_PATH.canvas, params: { flowId: landing.flowId } })
}
