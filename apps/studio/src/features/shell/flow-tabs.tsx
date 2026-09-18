import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { flowRouteApi } from "@/lib/routes"
import { FLOW_TABS, FLOW_TAB_ROUTE } from "./navigation"

const PATH_ONLY = { includeSearch: false } as const

export function FlowTabs() {
  const t = useTranslations("shell.tabs")
  const tabLabel = useTranslations("domain.flowTab")
  const params = flowRouteApi.useParams()
  return (
    <ChoiceList appearance="segmented" label={t("navAria")}>
      {FLOW_TABS.map((tab) => (
        <ChoiceLink key={tab} appearance="segmented" to={FLOW_TAB_ROUTE[tab]} params={params} activeOptions={PATH_ONLY}>
          {tabLabel(tab)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
