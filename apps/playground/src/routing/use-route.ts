import { useSyncExternalStore } from "react"
import { parseRoute } from "./route.js"
import type { Route } from "./route.js"

const subscribe = (notify: () => void): (() => void) => {
  window.addEventListener("hashchange", notify)
  return () => window.removeEventListener("hashchange", notify)
}

const snapshot = (): string => window.location.hash

export const useRoute = (): Route => parseRoute(useSyncExternalStore(subscribe, snapshot))
