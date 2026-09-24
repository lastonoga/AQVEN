import { useTranslations } from "use-intl"
import type { FlowId } from "@/domain"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { FLOW_TABS, FLOW_TAB_ROUTE } from "./navigation"

const PATH_ONLY = { includeSearch: false } as const

export function FlowTabs({ flowId }: { readonly flowId: FlowId }) {
  const t = useTranslations("shell.tabs")
  const tabLabel = useTranslations("domain.flowTab")
  return (
    <ChoiceList appearance="tabs" label={t("navAria")}>
      {FLOW_TABS.map((tab) => (
        <ChoiceLink key={tab} appearance="tabs" to={FLOW_TAB_ROUTE[tab]} params={{ flowId }} activeOptions={PATH_ONLY}>
          {tabLabel(tab)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
