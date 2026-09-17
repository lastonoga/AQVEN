import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { RunRef } from "@/domain"
import { Dot, Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { shellRouteApi } from "@/lib/routes"
import { runBadge } from "./presenters"
import { MODE_ROUTE } from "./navigation"

export function RunBadge({ run }: { readonly run: RunRef | null }) {
  const t = useTranslations("shell.run")
  const outcome = useTranslations("domain.outcome")
  const params = shellRouteApi.useParams()
  if (run === null) return null
  const badge = runBadge(run)
  return (
    <Button variant="outline" size="badge" asChild>
      <Link to={MODE_ROUTE.dataflow} params={params} search={{ run: run.id }} aria-label={t("openAria", { run: badge.label })}>
        <Dot tone={badge.tone} size="xs" />
        <Text role="cell" weight="medium" tone="default">
          {badge.label}
        </Text>
        <Tag tone={badge.tone} size="xs">
          {outcome(run.status)}
        </Tag>
      </Link>
    </Button>
  )
}
