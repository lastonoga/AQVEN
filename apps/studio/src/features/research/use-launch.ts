import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { ExperimentDetail, LaunchEstimate, LaunchRequest } from "@/domain"
import { usd } from "@/lib/format"
import { ROUTE_PATH } from "@/lib/routes"
import { availableOn, checkLaunch, draftOf, plannedCases, type LaunchCheck, type LaunchDraft } from "./presenters"
import { useLaunchEstimate, type EstimateState } from "./use-launch-estimate"
import { useResearchAction, type ResearchAction } from "./use-research-action"

export type Launch = {
  readonly draft: LaunchDraft
  readonly available: number
  readonly check: LaunchCheck
  readonly request: LaunchRequest | null
  readonly estimate: EstimateState
  readonly action: ResearchAction
  readonly update: (patch: Partial<LaunchDraft>) => void
  readonly start: (request: LaunchRequest) => void
}

export const priceOf = (state: EstimateState): string | null => {
  if (state.kind !== "ready" || state.estimate.usd === null) return null
  return usd(state.estimate.usd)
}

export const freshRequest = (experiment: Pick<ExperimentDetail, "cases" | "plan">, request: LaunchRequest | null): LaunchRequest | null => {
  const cases = plannedCases(experiment, "holdout")
  if (cases < 1) return null
  return { on: "holdout", cases, repeats: request?.repeats ?? experiment.plan.repeats }
}

export function useLaunch(experiment: ExperimentDetail, initial: LaunchRequest, estimate: LaunchEstimate | null): Launch {
  const navigate = useNavigate()
  const action = useResearchAction()
  const [draft, setDraft] = useState<LaunchDraft>(() => draftOf(initial))
  const available = availableOn(experiment, draft.on)
  const check = checkLaunch(draft, available)
  const request = check.kind === "valid" ? check.request : null
  const state = useLaunchEstimate(experiment.id, request, { request: initial, estimate })
  const update = (patch: Partial<LaunchDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }))
  }
  const start = (next: LaunchRequest): void => {
    action.run(
      "start",
      (api) => api.startSeries(experiment.id, next),
      async (seriesId) => {
        await navigate({ to: ROUTE_PATH.series, params: { seriesId } })
      },
    )
  }
  return { draft, available, check, request, estimate: state, action, update, start }
}
