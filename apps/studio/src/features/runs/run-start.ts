import { useState, useTransition } from "react"
import type { ApiRunStartRequest, RunId } from "@/domain"
import { ApiError, type ApiFailure } from "@/api/client"
import * as ids from "@/data/ids"
import { runsRouteApi } from "@/lib/routes"

export type RunStart = {
  readonly pending: boolean
  readonly failure: ApiFailure | null
  readonly start: (request: ApiRunStartRequest) => void
}

const UNKNOWN_FAILURE: ApiFailure = { op: "run_start", code: "UNKNOWN", message: "", problems: [], retryAfterMs: null }

const failureOf = (reason: unknown): ApiFailure => {
  if (!(reason instanceof ApiError)) return UNKNOWN_FAILURE
  return { op: reason.op, code: reason.code, message: reason.message, problems: reason.problems, retryAfterMs: reason.retryAfterMs }
}

export function useRunStart(onStarted: (runId: RunId) => void): RunStart {
  const { api } = runsRouteApi.useRouteContext()
  const [pending, startTransition] = useTransition()
  const [failure, setFailure] = useState<ApiFailure | null>(null)

  const settle = async (request: ApiRunStartRequest): Promise<void> => {
    const outcome = await api.run.start(request).then(
      (started) => ({ runId: ids.runId(started.run_id), failure: null }),
      (reason: unknown) => ({ runId: null, failure: failureOf(reason) }),
    )
    setFailure(outcome.failure)
    if (outcome.runId === null) return
    onStarted(outcome.runId)
  }

  const start = (request: ApiRunStartRequest): void => {
    setFailure(null)
    startTransition(() => settle(request))
  }

  return { pending, failure, start }
}
