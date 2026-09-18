import { createRouter, stringifySearchWith } from "@tanstack/react-router"
import { liveSources, type LiveSources } from "@/data/live/sources"
import { studioNow } from "@/lib/clock"
import { NotFound } from "@/routes/-not-found"
import { RouteError, RoutePending } from "@/routes/-feedback"
import { routeTree } from "./routeTree.gen"

export type RouterContext = { readonly api: LiveSources; readonly now: Date }

export const router = createRouter({
  routeTree,
  context: { api: liveSources, now: studioNow() },
  defaultPreload: "intent",
  defaultPendingMs: 300,
  defaultPendingMinMs: 400,
  defaultPendingComponent: RoutePending,
  defaultErrorComponent: RouteError,
  defaultNotFoundComponent: NotFound,
  scrollRestoration: true,
  scrollToTopSelectors: ["[data-scroll-restoration-id=page]"],
  stringifySearch: stringifySearchWith(JSON.stringify),
})

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
