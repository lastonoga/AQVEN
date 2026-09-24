import type { ReactNode } from "react"
import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { ROUTE_PATH } from "@/lib/routes"
import { PROJECT_MODES, type ProjectMode } from "./navigation"
import type { FlowScope } from "./selected-flow"

type ModeLinkProps = { readonly selected: FlowScope; readonly current: boolean; readonly children: ReactNode }

function FlowModeLink({ selected, current, children }: ModeLinkProps) {
  if (selected === null) {
    return (
      <ChoiceLink appearance="segmented" size="sm" to={ROUTE_PATH.home} selected={current}>
        {children}
      </ChoiceLink>
    )
  }
  return (
    <ChoiceLink appearance="segmented" size="sm" to={ROUTE_PATH.canvas} params={{ flowId: selected }} selected={current}>
      {children}
    </ChoiceLink>
  )
}

function ResearchModeLink({ current, children }: ModeLinkProps) {
  return (
    <ChoiceLink appearance="segmented" size="sm" to={ROUTE_PATH.research} selected={current}>
      {children}
    </ChoiceLink>
  )
}

const MODE_LINK: Readonly<Record<ProjectMode, (props: ModeLinkProps) => ReactNode>> = {
  flow: FlowModeLink,
  research: ResearchModeLink,
}

export function ModeSwitch({ mode, selected }: { readonly mode: ProjectMode | null; readonly selected: FlowScope }) {
  const t = useTranslations("shell.modes")
  return (
    <ChoiceList appearance="segmented" label={t("navAria")} className="shrink-0">
      {PROJECT_MODES.map((item) => {
        const ModeLink = MODE_LINK[item]
        return (
          <ModeLink key={item} selected={selected} current={item === mode}>
            {t(item)}
          </ModeLink>
        )
      })}
    </ChoiceList>
  )
}
