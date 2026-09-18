import { createRootRouteWithContext, Navigate, Outlet, useLocation } from "@tanstack/react-router"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ChatBackendProvider } from "@/features/chat-backend"
import type { RouterContext } from "@/router"
import { DEFAULT_LOCALE } from "@/routes/-defaults"
import { StudioIntl } from "@/routes/-intl"
import { NotFound } from "@/routes/-not-found"

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: RootNotFound,
})

function RootLayout() {
  const { api, now } = Route.useRouteContext()
  return (
    <TooltipProvider>
      <StudioIntl locale={DEFAULT_LOCALE} now={now}>
        <ChatBackendProvider api={api.chat}>
          <div className="h-dvh">
            <Outlet />
          </div>
        </ChatBackendProvider>
      </StudioIntl>
    </TooltipProvider>
  )
}

function RootNotFound() {
  const { now } = Route.useRouteContext()
  const { pathname, search } = useLocation()
  const canonicalPath = pathname === "/en" ? "/" : pathname.startsWith("/en/") ? pathname.slice(3) : null
  if (canonicalPath !== null) return <Navigate to={canonicalPath} search={search} replace />
  return (
    <StudioIntl locale={DEFAULT_LOCALE} now={now}>
      <NotFound />
    </StudioIntl>
  )
}
