import type { ReactNode } from "react"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider, type AnyRouter } from "@tanstack/react-router"
import { act, render } from "@testing-library/react"
import { router as appRouter } from "@/router"
import { routeTree } from "@/routeTree.gen"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouteError, RoutePending } from "@/routes/-feedback"
import { StudioIntl } from "@/routes/-intl"
import { TEST_NOW } from "./clock"

const mountRouter = async <R extends AnyRouter>(router: R): Promise<R> => {
  await act(async () => {
    render(<RouterProvider router={router} />)
    await router.load()
  })
  return router
}

export const renderRoute = (path: string) =>
  mountRouter(
    createRouter({
      routeTree,
      context: { ...appRouter.options.context, now: TEST_NOW },
      defaultPendingMs: 300,
      defaultPendingMinMs: 400,
      defaultPendingComponent: RoutePending,
      defaultErrorComponent: RouteError,
      history: createMemoryHistory({ initialEntries: [path] }),
    }),
  )

export const renderInRouter = async (ui: ReactNode): Promise<void> => {
  await mountRouter(
    createRouter({
      routeTree: createRootRoute({ component: () => ui }),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    }),
  )
}

export const renderInStudio = async (ui: ReactNode): Promise<void> => {
  await mountRouter(
    createRouter({
      routeTree: createRootRoute({
        component: () => (
          <TooltipProvider>
            <StudioIntl locale="en" now={TEST_NOW}>
              {ui}
            </StudioIntl>
          </TooltipProvider>
        ),
      }),
      context: { ...appRouter.options.context, now: TEST_NOW },
      history: createMemoryHistory({ initialEntries: ["/"] }),
    }),
  )
}
