import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ExperimentId, LaunchEstimate, LaunchRequest } from "@/domain"
import { messageOf } from "@/lib/errors"
import { requestKey } from "./presenters"

export type EstimateState =
  | { readonly kind: "ready"; readonly estimate: LaunchEstimate }
  | { readonly kind: "loading"; readonly stale: LaunchEstimate | null }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "none" }

export type InitialEstimate = { readonly request: LaunchRequest; readonly estimate: LaunchEstimate | null }

type Settled = Extract<EstimateState, { readonly kind: "ready" | "failed" }>

type Loaded = { readonly key: string; readonly state: Settled; readonly last: LaunchEstimate | null }

export const ESTIMATE_DELAY_MS = 300

const NONE: EstimateState = { kind: "none" }

const lastReady = (state: Settled, previous: Loaded | null): LaunchEstimate | null => (state.kind === "ready" ? state.estimate : (previous?.last ?? null))

export const shownEstimate = (state: EstimateState): LaunchEstimate | null => {
  if (state.kind === "ready") return state.estimate
  if (state.kind === "loading") return state.stale
  return null
}

export function useLaunchEstimate(experiment: ExperimentId, request: LaunchRequest | null, initial: InitialEstimate): EstimateState {
  const { api } = useRouter().options.context
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const preloaded = initial.estimate === null ? null : requestKey(initial.request)
  const on = request?.on ?? null
  const cases = request?.cases ?? null
  const repeats = request?.repeats ?? null

  useEffect(() => {
    if (on === null || cases === null || repeats === null) return
    const next: LaunchRequest = { on, cases, repeats }
    const key = requestKey(next)
    if (key === preloaded) return
    let live = true
    const settle = (state: Settled): void => {
      if (live) setLoaded((previous) => ({ key, state, last: lastReady(state, previous) }))
    }
    const timer = setTimeout(() => {
      void api.research.estimate(experiment, next).then(
        (estimate) => {
          settle({ kind: "ready", estimate })
        },
        (reason: unknown) => {
          settle({ kind: "failed", message: messageOf(reason) })
        },
      )
    }, ESTIMATE_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [api, experiment, on, cases, repeats, preloaded])

  if (request === null) return NONE
  const key = requestKey(request)
  if (key === preloaded && initial.estimate !== null) return { kind: "ready", estimate: initial.estimate }
  if (loaded !== null && loaded.key === key) return loaded.state
  return { kind: "loading", stale: loaded?.last ?? initial.estimate }
}
