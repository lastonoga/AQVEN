import { useTranslations } from "use-intl"
import type { CallId, CallSheetTab, DataflowRun } from "@/domain"
import { Empty, Page } from "@/components/studio"
import { CallSheet } from "@/features/call-sheet"
import { useCallSheet } from "@/lib/search"
import { dataflowRouteApi, ROUTE_ID } from "@/lib/routes"
import { RunView } from "./run-view"
import { RunsStrip } from "./runs-strip"

type RunBodyProps = {
  readonly dataflow: DataflowRun | null
  readonly onOpenCall: (callId: CallId, tab: CallSheetTab) => void
}

function RunBody({ dataflow, onOpenCall }: RunBodyProps) {
  const t = useTranslations("common.empty")
  if (dataflow === null) return <Empty title={t("run")} />
  return <RunView dataflow={dataflow} onOpenCall={onOpenCall} />
}

export function DataflowScreen() {
  const { runs, runId, dataflow, call } = dataflowRouteApi.useLoaderData()
  const sheet = useCallSheet(ROUTE_ID.dataflow)
  return (
    <div className="relative h-full min-h-0">
      <Page width="xl">
        <RunsStrip runs={runs} runId={runId} />
        <RunBody dataflow={dataflow} onOpenCall={sheet.open} />
      </Page>
      <CallSheet open={sheet.callId !== undefined} detail={call} tab={sheet.tab} onTabChange={sheet.setTab} onClose={sheet.close} />
    </div>
  )
}
