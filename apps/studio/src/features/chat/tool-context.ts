import { linkOptions, useNavigate } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { CallId, CallSheetTab, ColumnId, RunId } from "@/domain"
import { ROUTE_PATH, shellRouteApi, type WorkflowParams } from "@/lib/routes"
import type { Translator } from "@/i18n/translator"

export type ToolContext = {
  readonly t: Translator<"chat">
  readonly openRun: (runId: RunId) => void
  readonly openAttempts: (runId: RunId, columnId: ColumnId) => void
  readonly openCall: (runId: RunId, callId: CallId, tab: CallSheetTab) => void
}

const attemptsHash = (columnId: ColumnId): string => `attempts-${columnId}`

const runLink = (params: WorkflowParams, run: RunId) => linkOptions({ to: ROUTE_PATH.dataflow, params, search: { run } })

const attemptsLink = (params: WorkflowParams, run: RunId, columnId: ColumnId) =>
  linkOptions({ to: ROUTE_PATH.dataflow, params, search: { run }, hash: attemptsHash(columnId), hashScrollIntoView: { block: "start" } })

const callLink = (params: WorkflowParams, run: RunId, call: CallId, callTab: CallSheetTab) =>
  linkOptions({ to: ROUTE_PATH.dataflow, params, search: { run, call, callTab } })

export function useToolContext(): ToolContext {
  const t = useTranslations("chat")
  const navigate = useNavigate()
  const params = shellRouteApi.useParams()
  return {
    t,
    openRun: (run) => void navigate(runLink(params, run)),
    openAttempts: (run, columnId) => void navigate(attemptsLink(params, run, columnId)),
    openCall: (run, call, tab) => void navigate(callLink(params, run, call, tab)),
  }
}
