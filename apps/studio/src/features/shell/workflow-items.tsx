import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ShellData } from "@/domain"
import { Dot, Text } from "@/components/studio"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { useRelativeTime } from "@/i18n/format"
import { shellRouteApi } from "@/lib/routes"
import { workflowRows, type WorkflowRow } from "./presenters"
import { MODE_ROUTE, useCurrentMode } from "./navigation"

type WorkflowItemsProps = { readonly shell: ShellData; readonly onNavigate: () => void }

function CurrentMarker({ row }: { readonly row: WorkflowRow }) {
  const t = useTranslations("shell.picker")
  if (!row.current) return null
  return (
    <Text role="small" weight="medium" tone="llm" className="shrink-0">
      {t("current")}
    </Text>
  )
}

export function WorkflowItems({ shell, onNavigate }: WorkflowItemsProps) {
  const t = useTranslations("shell.picker")
  const since = useRelativeTime("narrow")
  const mode = useCurrentMode()
  const params = shellRouteApi.useParams()
  const rows = workflowRows(shell, {
    stages: (count) => t("stages", { count }),
    run: (run) => t("run", { run }),
    neverRun: t("neverRun"),
    since,
  })
  return rows.map((row) => (
    <DropdownMenuItem key={row.id} asChild selected={row.current} className="gap-2.25 px-2.25 py-2">
      <Link to={MODE_ROUTE[mode]} params={{ ...params, workflowId: row.id }} onClick={onNavigate}>
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
