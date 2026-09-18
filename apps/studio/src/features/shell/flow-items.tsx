import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiFlow, FlowId } from "@/domain"
import { Dot, Text } from "@/components/studio"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { isoDateTime } from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import { flowRouteApi } from "@/lib/routes"
import { flowRows, type FlowRow } from "./presenters"
import { FLOW_TAB_ROUTE, useCurrentFlowTab } from "./navigation"

type FlowItemsProps = { readonly flows: readonly ApiFlow[]; readonly currentId: FlowId; readonly onNavigate: () => void }

function CurrentMarker({ row }: { readonly row: FlowRow }) {
  const t = useTranslations("shell.picker")
  if (!row.current) return null
  return (
    <Text role="small" weight="medium" tone="llm" className="shrink-0">
      {t("current")}
    </Text>
  )
}

export function FlowItems({ flows, currentId, onNavigate }: FlowItemsProps) {
  const t = useTranslations("shell.picker")
  const since = useRelativeTime("narrow")
  const tab = useCurrentFlowTab()
  const params = flowRouteApi.useParams()
  const rows = flowRows(flows, currentId, {
    nodes: (count) => t("nodes", { count }),
    run: (run) => t("run", { run }),
    neverRun: t("neverRun"),
    since: (startedAt) => since(isoDateTime(startedAt)),
  })
  return rows.map((row) => (
    <DropdownMenuItem key={row.id} asChild selected={row.current} className="gap-2.25 px-2.25 py-2">
      <Link to={FLOW_TAB_ROUTE[tab]} params={{ ...params, flowId: row.id }} onClick={onNavigate}>
        <Dot tone={row.dot} />
        <div className="min-w-0 flex-1">
          <Text as="div" role="entry" weight="semibold" tone="default" truncate>
            {row.id}
          </Text>
          <Text as="div" role="menu" tone="neutral" truncate className="mt-1">
            {row.meta}
          </Text>
        </div>
        <CurrentMarker row={row} />
      </Link>
    </DropdownMenuItem>
  ))
}
