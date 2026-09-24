import { useEffect, useState } from "react"
import type { ApiExecution, ExecutionStatus, RunId, SeriesAttempt, SeriesCaseRow, SeriesId, SeriesSummary, VariantId } from "@/domain"
import { messageOf } from "@/lib/errors"
import { experimentRouteApi } from "@/lib/routes"
import type { RouterContext } from "@/router"

export const SAMPLED_ATTEMPTS = 4

export type StepRun = {
  readonly run: RunId
  readonly caseName: string
  readonly repeat: number
  readonly status: ExecutionStatus
  readonly latencyMs: number | null
  readonly usd: number
  readonly model: string | null
  readonly summary: string | null
}

export type VariantRuns = { readonly variant: VariantId; readonly attempts: number; readonly runs: readonly StepRun[] }

export type StepResults =
  | { readonly kind: "none" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly series: SeriesId; readonly variants: readonly VariantRuns[] }
  | { readonly kind: "failed"; readonly message: string }

type Sources = RouterContext["api"]

type CaseAttempt = SeriesAttempt & { readonly caseName: string }

type Sample = { readonly variant: VariantId; readonly attempts: number; readonly picked: readonly CaseAttempt[] }

const NONE: StepResults = { kind: "none" }
const LOADING: StepResults = { kind: "loading" }

const sampleOf = (rows: readonly SeriesCaseRow[], variant: VariantId): Sample => {
  const attempts = rows.flatMap((row) => row.attempts.filter((attempt) => attempt.variant === variant).map((attempt) => ({ ...attempt, caseName: row.name })))
  const spread = [...attempts].sort((left, right) => left.repeat - right.repeat)
  return { variant, attempts: attempts.length, picked: spread.slice(0, SAMPLED_ATTEMPTS) }
}

const stepRun = (attempt: CaseAttempt, executions: readonly ApiExecution[], node: string): readonly StepRun[] => {
  const execution = executions.findLast((item) => item.address.node_id === node)
  if (execution === undefined) return []
  return [
    {
      run: attempt.run,
      caseName: attempt.caseName,
      repeat: attempt.repeat,
      status: execution.status,
      latencyMs: execution.latency_ms,
      usd: Number(execution.cost_usd),
      model: execution.model,
      summary: execution.summary,
    },
  ]
}

const variantRuns = async (api: Sources, sample: Sample, node: string): Promise<VariantRuns> => {
  const runs = await Promise.all(sample.picked.map(async (attempt) => stepRun(attempt, await api.run.executions(attempt.run), node)))
  return { variant: sample.variant, attempts: sample.attempts, runs: runs.flat() }
}

const loadResults = async (api: Sources, series: SeriesSummary, node: string): Promise<readonly VariantRuns[]> => {
  const rows = await api.research.seriesCases(series.id)
  return Promise.all(series.variants.map((variant) => variantRuns(api, sampleOf(rows, variant), node)))
}

export function useStepResults(series: SeriesSummary | null, node: string): StepResults {
  const { api } = experimentRouteApi.useRouteContext()
  const [state, setState] = useState<StepResults>(LOADING)
  useEffect(() => {
    if (series === null) return
    let active = true
    void loadResults(api, series, node).then(
      (variants) => {
        if (active) setState({ kind: "ready", series: series.id, variants })
      },
      (reason: unknown) => {
        if (active) setState({ kind: "failed", message: messageOf(reason) })
      },
    )
    return () => {
      active = false
    }
  }, [api, series, node])
  return series === null ? NONE : state
}
