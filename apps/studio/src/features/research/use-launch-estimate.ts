import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ExperimentId, LaunchEstimate, LaunchRequest } from "@/domain"
import { messageOf } from "@/lib/errors"
import { requestKey } from "./presenters"

export type EstimateState =
  | { readonly kind: "ready"; readonly estimate: LaunchEstimate }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "none" }

type Loaded = { readonly key: string; readonly state: EstimateState }

const LOADING: EstimateState = { kind: "loading" }
const NONE: EstimateState = { kind: "none" }

export function useLaunchEstimate(experiment: ExperimentId, request: LaunchRequest | null, initial: LaunchEstimate): EstimateState {
  const { api } = useRouter().options.context
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const initialKey = requestKey(initial.request)
  const on = request?.on ?? null
  const cases = request?.cases ?? null
  const repeats = request?.repeats ?? null

  useEffect(() => {
    if (on === null || cases === null || repeats === null) return
    const next: LaunchRequest = { on, cases, repeats }
    const key = requestKey(next)
    if (key === initialKey) return
    let live = true
    void api.research.estimate(experiment, next).then(
      (estimate) => {
        if (live) setLoaded({ key, state: { kind: "ready", estimate } })
      },
      (reason: unknown) => {
        if (live) setLoaded({ key, state: { kind: "failed", message: messageOf(reason) } })
      },
    )
    return () => {
      live = false
    }
  }, [api, experiment, on, cases, repeats, initialKey])

  if (request === null) return NONE
  const key = requestKey(request)
  if (key === initialKey) return { kind: "ready", estimate: initial }
  if (loaded === null || loaded.key !== key) return LOADING
  return loaded.state
}
