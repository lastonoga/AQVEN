import { Link } from "@tanstack/react-router"
import { ArrowLeft, Slash } from "lucide-react"
import { useTranslations } from "use-intl"
import type { TestDetail } from "@/domain"
import { Text } from "@/components/studio"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { ROUTE_PATH, testDetailRouteApi } from "@/lib/routes"

function CrumbSeparator() {
  return (
    <BreadcrumbSeparator>
      <Slash />
    </BreadcrumbSeparator>
  )
}

export function BreadcrumbBar({ detail }: { readonly detail: TestDetail }) {
  const t = useTranslations("testDetail.breadcrumb")
  const { locale, workspaceId, workflowId } = testDetailRouteApi.useParams()
  const scope = { locale, workspaceId, workflowId }
  return (
    <div className="mb-3 flex items-center gap-2">
      <Button variant="outline" size="xs" asChild>
        <Link to={ROUTE_PATH.tests} params={scope}>
          <ArrowLeft aria-hidden />
          {t("allTests")}
        </Link>
      </Button>
      <Breadcrumb aria-label={t("label")}>
        <BreadcrumbList className="gap-2">
          <BreadcrumbItem>{workflowId}</BreadcrumbItem>
          <CrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={ROUTE_PATH.dataflow} params={scope} hash={`stage-${detail.stage.stageId}`} hashScrollIntoView={{ block: "start" }}>
                <Text role="crumb" tone="default">
                  {t("dataflowStage", { stage: detail.stage.index })}
                </Text>
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <CrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              <Text role="cell">{t("call", { node: detail.target.nodeId })}</Text>
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  )
}
