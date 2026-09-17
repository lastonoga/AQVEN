import { createRouter, stringifySearchWith } from "@tanstack/react-router"
import type { StudioSources } from "@/data/ports"
import { sources } from "@/data/sources"
import { studioNow } from "@/lib/clock"
import { NotFound } from "@/routes/-not-found"
import { routeTree } from "./routeTree.gen"

export type RouterContext = { readonly sources: StudioSources; readonly now: Date }

export const router = createRouter({
  routeTree,
  context: { sources, now: studioNow() },
  defaultPreload: "intent",
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
