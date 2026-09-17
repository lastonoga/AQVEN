import { redirect } from "@tanstack/react-router"
import type { Locale } from "@/domain"
import type { RouterContext } from "@/router"
import { landingOf } from "@/lib/setup"

export const redirectToLanding = async ({ sources }: RouterContext, locale: Locale): Promise<never> => {
  const landing = landingOf(await sources.setup.overview())
  if (landing.kind === "setup") throw redirect({ to: "/$locale/setup", params: { locale } })
  throw redirect({
    to: "/$locale/$workspaceId/$workflowId/schema",
    params: { locale, workspaceId: landing.workspaceId, workflowId: landing.workflowId },
  })
}
