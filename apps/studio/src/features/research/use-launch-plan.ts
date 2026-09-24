import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ExperimentId, LaunchPlan, LaunchRequest } from "@/domain"
import { messageOf } from "@/lib/errors"
import { requestKey } from "./presenters"

export type PlanState =
  | { readonly kind: "ready"; readonly plan: LaunchPlan }
  | { readonly kind: "loading"; readonly stale: LaunchPlan | null }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "none" }

export type InitialPlan = { readonly request: LaunchRequest; readonly plan: LaunchPlan | null }

type Settled = Extract<PlanState, { readonly kind: "ready" | "failed" }>

type Loaded = { readonly key: string; readonly state: Settled; readonly last: LaunchPlan | null }

export const PLAN_DELAY_MS = 300

const NONE: PlanState = { kind: "none" }

const lastReady = (state: Settled, previous: Loaded | null): LaunchPlan | null => (state.kind === "ready" ? state.plan : (previous?.last ?? null))

export const shownPlan = (state: PlanState): LaunchPlan | null => {
  if (state.kind === "ready") return state.plan
  if (state.kind === "loading") return state.stale
  return null
}

export function useLaunchPlan(experiment: ExperimentId, request: LaunchRequest | null, initial: InitialPlan): PlanState {
  const { api } = useRouter().options.context
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const preloaded = initial.plan === null ? null : requestKey(initial.request)
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
      void api.research.launchPlan(experiment, next).then(
        (plan) => {
          settle({ kind: "ready", plan })
        },
        (reason: unknown) => {
          settle({ kind: "failed", message: messageOf(reason) })
        },
      )
    }, PLAN_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [api, experiment, on, cases, repeats, preloaded])

  if (request === null) return NONE
  const key = requestKey(request)
  if (key === preloaded && initial.plan !== null) return { kind: "ready", plan: initial.plan }
  if (loaded !== null && loaded.key === key) return loaded.state
  return { kind: "loading", stale: loaded?.last ?? initial.plan }
}
