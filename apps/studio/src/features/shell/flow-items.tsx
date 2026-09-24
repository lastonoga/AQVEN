import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiFlow, FlowId } from "@/domain"
import { Dot, Text } from "@/components/studio"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { isoDateTime } from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import { flowRows, type FlowRow } from "./presenters"
import { FLOW_TAB_ROUTE, useCurrentFlowTab } from "./navigation"

export type FlowItemsProps = { readonly flows: readonly ApiFlow[]; readonly selected: FlowId; readonly onNavigate: () => void }

const ITEM_CLASS = "gap-2.25 px-2.25 py-2"

function CurrentMarker({ current }: { readonly current: boolean }) {
  const t = useTranslations("shell.picker")
  if (!current) return null
  return (
    <Text role="small" weight="medium" tone="llm" className="shrink-0">
      {t("current")}
    </Text>
  )
}

function ItemBody({ title, meta, current, tone }: { readonly title: string; readonly meta: string; readonly current: boolean; readonly tone: FlowRow["dot"] }) {
  return (
    <>
      <Dot tone={tone} />
      <div className="min-w-0 flex-1">
        <Text as="div" role="entry" weight="semibold" tone="default" truncate>
          {title}
        </Text>
        <Text as="div" role="menu" tone="neutral" truncate className="mt-1">
          {meta}
        </Text>
      </div>
      <CurrentMarker current={current} />
    </>
  )
}

function useRows(flows: readonly ApiFlow[], selected: FlowId): readonly FlowRow[] {
  const t = useTranslations("shell.picker")
  const since = useRelativeTime("narrow")
  return flowRows(flows, selected, {
    nodes: (count) => t("nodes", { count }),
    run: (run) => t("run", { run }),
    neverRun: t("neverRun"),
    since: (startedAt) => since(isoDateTime(startedAt)),
  })
}

export function FlowItems({ flows, selected, onNavigate }: FlowItemsProps) {
  const tab = useCurrentFlowTab()
  const rows = useRows(flows, selected)
  return rows.map((row) => (
    <DropdownMenuItem key={row.id} asChild selected={row.current} className={ITEM_CLASS}>
      <Link to={FLOW_TAB_ROUTE[tab]} params={{ flowId: row.id }} onClick={onNavigate}>
        <ItemBody title={row.id} meta={row.meta} current={row.current} tone={row.dot} />
      </Link>
    </DropdownMenuItem>
  ))
}
