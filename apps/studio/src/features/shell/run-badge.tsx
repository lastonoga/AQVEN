import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiRunBrief } from "@/domain"
import { Dot, Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { runId } from "@/data/ids"
import { flowRouteApi } from "@/lib/routes"
import { runBadge } from "./presenters"
import { FLOW_TAB_ROUTE } from "./navigation"

export function RunBadge({ run }: { readonly run: ApiRunBrief | null }) {
  const t = useTranslations("shell.run")
  const runStatus = useTranslations("domain.runStatus")
  const params = flowRouteApi.useParams()
  if (run === null) return null
  const badge = runBadge(run)
  return (
    <Button variant="outline" size="badge" asChild>
      <Link
        to={FLOW_TAB_ROUTE.runs}
        params={params}
        search={{ run: runId(badge.full) }}
        title={badge.full}
        aria-label={t("openAria", { run: badge.label })}
      >
        <Dot tone={badge.tone} size="xs" />
        <Text role="cell" weight="medium" tone="default">
          {badge.label}
        </Text>
        <Tag tone={badge.tone} size="xs">
          {runStatus(badge.status)}
        </Tag>
      </Link>
    </Button>
  )
}
