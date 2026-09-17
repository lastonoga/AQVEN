import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { RouterContext } from "@/router"
import { DEFAULT_LOCALE } from "@/routes/-defaults"
import { StudioIntl } from "@/routes/-intl"
import { NotFound } from "@/routes/-not-found"

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: RootNotFound,
})

function RootLayout() {
  return (
    <TooltipProvider>
      <div className="h-dvh">
        <Outlet />
      </div>
    </TooltipProvider>
  )
}

function RootNotFound() {
  const { now } = Route.useRouteContext()
  return (
    <StudioIntl locale={DEFAULT_LOCALE} now={now}>
      <NotFound />
    </StudioIntl>
  )
}
