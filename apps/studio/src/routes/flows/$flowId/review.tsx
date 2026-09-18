import { createFileRoute } from "@tanstack/react-router"
import type { ApiExecutionDetail, ApiJsonObject, NodeId, RunId } from "@/domain"
import { isNotFound } from "@/api/client"
import * as ids from "@/data/ids"
import { ReviewScreen, type ReviewEntry } from "@/features/review"
import { parseFlag, parseId, parseText } from "@/lib/search"
import { optional, searchValidator, type RawSearch } from "@/routes/-search"

type ReviewSearch = { readonly run?: RunId; readonly node?: NodeId; readonly branch?: string; readonly overdue?: boolean }

const parseRun = parseId(ids.runId)
const parseNode = parseId(ids.nodeId)

const parseOverdue = (raw: unknown): true | undefined => (parseFlag(raw) === true ? true : undefined)

const parseReviewSearch = (raw: RawSearch): ReviewSearch => ({
  ...optional("run", parseRun(raw["run"])),
  ...optional("node", parseNode(raw["node"])),
  ...optional("branch", parseText(raw["branch"])),
  ...optional("overdue", parseOverdue(raw["overdue"])),
})

const matches = (entry: ReviewEntry, search: ReviewSearch): boolean => {
  if (search.run !== undefined && entry.run.run_id !== search.run) return false
  if (search.node !== undefined && entry.wait.address.node_id !== search.node) return false
  return search.branch === undefined || entry.wait.address.branch_key === search.branch
}

const isSchema = (value: unknown): value is ApiJsonObject => typeof value === "object" && value !== null && !Array.isArray(value)

const orNull = async <T,>(load: Promise<T>): Promise<T | null> =>
  load.catch((error: unknown) => {
    if (isNotFound(error)) return null
    throw error
  })

const formSchema = async (
  detail: ApiExecutionDetail | null,
  entry: ReviewEntry | null,
  readType: (typeId: string) => Promise<ApiJsonObject | null>,
): Promise<ApiJsonObject | null> => {
  const inline = detail?.human?.form_schema ?? null
  if (inline !== null || entry === null) return inline
  return readType(entry.wait.form_type_id)
}

const validateReviewSearch = searchValidator(parseReviewSearch)

export const Route = createFileRoute("/flows/$flowId/review")({
  validateSearch: validateReviewSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { api }, params, deps }) => {
    const suspended = await api.run.list({ flowId: params.flowId, status: "suspended", sort: "deadline_at", ...optional("overdue", deps.overdue) })
    const queue: readonly ReviewEntry[] = suspended.flatMap((run) => run.waits.filter((wait) => wait.state === "waiting").map((wait) => ({ run, wait })))
    const selected = queue.find((entry) => matches(entry, deps)) ?? queue[0] ?? null
    const detail = selected === null ? null : await orNull(api.run.execution(ids.runId(selected.run.run_id), selected.wait.address, "full"))
    const schema = await formSchema(detail, selected, async (typeId) => {
      const type = await orNull(api.project.type(ids.typeId(typeId)))
      return type !== null && isSchema(type.json_schema) ? type.json_schema : null
    })
    const suspend = detail?.human?.suspend_data
    const blobText = suspend?.kind === "blob" && (suspend.media_type.includes("json") || suspend.media_type.startsWith("text/"))
      ? await api.blob.read(ids.blobId(suspend.blob_id)).catch(() => undefined)
      : undefined
    return { queue, selected, detail, schema, blobText }
  },
  component: ReviewScreen,
})
