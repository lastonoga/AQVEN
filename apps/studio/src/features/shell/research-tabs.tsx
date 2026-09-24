import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { RESEARCH_TABS, RESEARCH_TAB_ROUTE, useCurrentResearchTab } from "./navigation"

export function ResearchTabs() {
  const t = useTranslations("shell.researchTabs")
  const current = useCurrentResearchTab()
  return (
    <ChoiceList appearance="tabs" label={t("navAria")}>
      {RESEARCH_TABS.map((tab) => (
        <ChoiceLink key={tab} appearance="tabs" to={RESEARCH_TAB_ROUTE[tab]} selected={tab === current}>
          {t(tab)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
