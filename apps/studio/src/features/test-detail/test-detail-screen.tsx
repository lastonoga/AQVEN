import { useTranslations } from "use-intl"
import type { TestDetail } from "@/domain"
import { Empty, Page } from "@/components/studio"
import { CallSheet } from "@/features/call-sheet"
import { useCallSheet } from "@/lib/search"
import { ROUTE_ID, testDetailRouteApi } from "@/lib/routes"
import { BreadcrumbBar } from "./breadcrumb-bar"
import { DatasetSection } from "./dataset-section"
import { ResultsSection } from "./results-section"
import { RowNavigator } from "./row-navigator"
import { RowTraceView } from "./row-trace"
import { RunHistoryCard } from "./run-history"
import { SummaryPanel } from "./summary-panel"

function MissingTest() {
  const t = useTranslations("testDetail")
  return (
    <Page width="xl">
      <Empty title={t("notFound")} />
    </Page>
  )
}

function TestDetailView({ detail }: { readonly detail: TestDetail }) {
  const { rowId, row, trace, call } = testDetailRouteApi.useLoaderData()
  const { failures } = testDetailRouteApi.useSearch()
  const sheet = useCallSheet(ROUTE_ID.testDetail)
  return (
    <div className="relative h-full min-h-0">
      <Page width="xl">
        <BreadcrumbBar detail={detail} />
        <SummaryPanel detail={detail} />
        <DatasetSection detail={detail} rowId={rowId} failures={failures} />
        <ResultsSection detail={detail} rowId={rowId} failures={failures} />
        <RowNavigator rows={detail.dataset.rows} row={row} total={detail.dataset.rowCount} failures={failures} />
        <RowTraceView trace={trace} onOpenCall={sheet.open} />
        <RunHistoryCard history={detail.runHistory} />
      </Page>
      <CallSheet open={sheet.callId !== undefined} detail={call} tab={sheet.tab} onTabChange={sheet.setTab} onClose={sheet.close} />
    </div>
  )
}

export function TestDetailScreen() {
  const { detail } = testDetailRouteApi.useLoaderData()
  if (detail === null) return <MissingTest />
  return <TestDetailView detail={detail} />
}
