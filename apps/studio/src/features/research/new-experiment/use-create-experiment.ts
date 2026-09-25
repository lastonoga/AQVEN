import { useState } from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import type { CreatedExperiment, ExperimentCreate } from "@/domain"
import { ROUTE_PATH } from "@/lib/routes"
import { hasErrors, writeFailureOf, type WriteFailure } from "../authoring"

export type CreateState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending" }
  | { readonly kind: "failed"; readonly failure: WriteFailure }
  | { readonly kind: "written"; readonly created: CreatedExperiment }

export type CreateExperiment = { readonly state: CreateState; readonly create: (draft: ExperimentCreate) => void }

const IDLE: CreateState = { kind: "idle" }
const PENDING: CreateState = { kind: "pending" }

export function useCreateExperiment(): CreateExperiment {
  const router = useRouter()
  const navigate = useNavigate()
  const [state, setState] = useState<CreateState>(IDLE)

  const open = async (created: CreatedExperiment): Promise<void> => {
    if (hasErrors(created.diagnostics)) {
      setState({ kind: "written", created })
      return
    }
    await navigate({ to: ROUTE_PATH.experiment, params: { experimentId: created.experiment } })
  }

  const create = (draft: ExperimentCreate): void => {
    if (state.kind === "pending") return
    setState(PENDING)
    void router.options.context.api.authoring
      .create(draft)
      .then(open)
      .catch((reason: unknown) => {
        setState({ kind: "failed", failure: writeFailureOf(reason) })
      })
  }

  return { state, create }
}
