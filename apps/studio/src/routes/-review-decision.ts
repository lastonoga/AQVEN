import { useState, useTransition } from "react"
import { useRouter } from "@tanstack/react-router"
import type { ApiExecutionAddress, ApiJsonValue, RunId } from "@/domain"
import { ApiError, type ApiFailure } from "@/api/client"
import { reviewRouteApi } from "@/lib/routes"

export type ResumeCommand = {
  readonly runId: RunId
  readonly address: ApiExecutionAddress
  readonly attempt: number
  readonly payload: ApiJsonValue
  readonly clientOpId: string
}

export type ReviewDecision = {
  readonly pending: boolean
  readonly failure: ApiFailure | null
  readonly resume: (command: ResumeCommand) => void
}

const UNKNOWN_FAILURE: ApiFailure = { op: "run_resume", code: "UNKNOWN", message: "", problems: [], retryAfterMs: null }

const failureOf = (reason: unknown): ApiFailure => {
  if (!(reason instanceof ApiError)) return UNKNOWN_FAILURE
  return { op: reason.op, code: reason.code, message: reason.message, problems: reason.problems, retryAfterMs: reason.retryAfterMs }
}

export function useReviewDecision(): ReviewDecision {
  const { api } = reviewRouteApi.useRouteContext()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  const settle = async ({ runId, address, attempt, payload, clientOpId }: ResumeCommand): Promise<void> => {
    const rejection = await api.run.resume(runId, { address, attempt, payload, client_op_id: clientOpId }).then(
      () => null,
      (reason: unknown) => failureOf(reason),
    )
    setFailure(rejection)
    if (rejection === null) await router.invalidate()
  }

  const resume = (command: ResumeCommand): void => {
    setFailure(null)
    startTransition(() => settle(command))
  }

  return { pending, failure, resume }
}
