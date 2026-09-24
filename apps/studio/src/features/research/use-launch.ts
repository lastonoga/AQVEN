import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import type { ExperimentDetail, LaunchPlan, LaunchRequest } from "@/domain"
import { ROUTE_PATH } from "@/lib/routes"
import { availableOn, checkLaunch, draftOf, plannedCases, type LaunchCheck, type LaunchDraft } from "./presenters"
import { useLaunchPlan, type PlanState } from "./use-launch-plan"
import { useResearchAction, type ResearchAction } from "./use-research-action"

export type Launch = {
  readonly draft: LaunchDraft
  readonly available: number
  readonly check: LaunchCheck
  readonly request: LaunchRequest | null
  readonly plan: PlanState
  readonly action: ResearchAction
  readonly update: (patch: Partial<LaunchDraft>) => void
  readonly start: (request: LaunchRequest) => void
}

export const freshRequest = (experiment: Pick<ExperimentDetail, "cases" | "plan">, request: LaunchRequest | null): LaunchRequest | null => {
  const cases = plannedCases(experiment, "holdout")
  if (cases < 1) return null
  return { on: "holdout", cases, repeats: request?.repeats ?? experiment.plan.repeats }
}

export function useLaunch(experiment: ExperimentDetail, initial: LaunchRequest, plan: LaunchPlan | null): Launch {
  const navigate = useNavigate()
  const action = useResearchAction()
  const [draft, setDraft] = useState<LaunchDraft>(() => draftOf(initial))
  const available = availableOn(experiment, draft.on)
  const check = checkLaunch(draft, available)
  const request = check.kind === "valid" ? check.request : null
  const state = useLaunchPlan(experiment.id, request, { request: initial, plan })
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
  return { draft, available, check, request, plan: state, action, update, start }
}
