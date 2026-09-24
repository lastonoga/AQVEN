import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { RESEARCH_TABS, RESEARCH_TAB_ROUTE, researchSearch, useCurrentResearchTab } from "./navigation"
import type { FlowScope } from "./selected-flow"

export function ResearchTabs({ selected }: { readonly selected: FlowScope }) {
  const t = useTranslations("shell.researchTabs")
  const current = useCurrentResearchTab()
  return (
    <ChoiceList appearance="tabs" label={t("navAria")}>
      {RESEARCH_TABS.map((tab) => (
        <ChoiceLink key={tab} appearance="tabs" to={RESEARCH_TAB_ROUTE[tab]} search={researchSearch(selected)} selected={tab === current}>
          {t(tab)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
