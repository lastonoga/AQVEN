import type { ApiExecutionDetail, ApiJsonObject, FlowId, RunId, SeriesId } from "@/domain"
import { isNotFound } from "@/api/client"
import * as ids from "@/data/ids"
import type { RouterContext } from "@/router"
import type { ReviewEntry } from "./presenters"

export type StudioApi = RouterContext["api"]

export type WaitsTarget = { readonly runId: RunId | null; readonly seriesId: SeriesId | null; readonly flowId: FlowId | null }

export type WaitDetail = {
  readonly detail: ApiExecutionDetail | null
  readonly schema: ApiJsonObject | null
  readonly blobText: string | undefined
}

const orNull = async <T>(load: Promise<T>): Promise<T | null> =>
  load.catch((error: unknown) => {
    if (isNotFound(error)) return null
    throw error
  })

const isSchema = (value: unknown): value is ApiJsonObject => typeof value === "object" && value !== null && !Array.isArray(value)

const seriesWaitingRuns = async (api: StudioApi, seriesId: SeriesId): Promise<readonly RunId[]> => {
  const rows = await api.research.seriesCases(seriesId)
  return rows.flatMap((row) => row.attempts).filter((attempt) => attempt.outcome === "waiting").map((attempt) => attempt.run)
}

const targetRuns = async (api: StudioApi, target: WaitsTarget): Promise<readonly RunId[]> => {
  if (target.runId !== null) return [target.runId]
  if (target.seriesId !== null) return seriesWaitingRuns(api, target.seriesId)
  return []
}

export const loadWaits = async (api: StudioApi, target: WaitsTarget): Promise<readonly ReviewEntry[]> => {
  const runs = await targetRuns(api, target)
  if (runs.length === 0) return []
  const suspended = await api.run.list({ ...(target.flowId === null ? {} : { flowId: target.flowId }), status: "suspended", sort: "deadline_at" })
  return suspended
    .filter((run) => runs.includes(ids.runId(run.run_id)))
    .flatMap((run) => run.waits.filter((wait) => wait.state === "waiting").map((wait) => ({ run, wait })))
}

const formSchema = async (api: StudioApi, detail: ApiExecutionDetail | null, entry: ReviewEntry): Promise<ApiJsonObject | null> => {
  const inline = detail?.human?.form_schema ?? null
  if (inline !== null) return inline
  const type = await orNull(api.project.type(ids.typeId(entry.wait.form_type_id)))
  return type !== null && isSchema(type.json_schema) ? type.json_schema : null
}

const readableBlob = (detail: ApiExecutionDetail | null): string | null => {
  const suspend = detail?.human?.suspend_data
  if (suspend?.kind !== "blob") return null
  return suspend.media_type.includes("json") || suspend.media_type.startsWith("text/") ? suspend.blob_id : null
}

const blobTextOf = async (api: StudioApi, detail: ApiExecutionDetail | null): Promise<string | undefined> => {
  const blob = readableBlob(detail)
  if (blob === null) return undefined
  return api.blob.read(ids.blobId(blob)).catch(() => undefined)
}

export const loadWaitDetail = async (api: StudioApi, entry: ReviewEntry): Promise<WaitDetail> => {
  const detail = await orNull(api.run.execution(ids.runId(entry.run.run_id), entry.wait.address, "full"))
  const [schema, blobText] = await Promise.all([formSchema(api, detail, entry), blobTextOf(api, detail)])
  return { detail, schema, blobText }
}
