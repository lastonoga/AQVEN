import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { MODE_ROUTE, PROJECT_MODES, type ProjectMode } from "./navigation"

export function ModeSwitch({ mode }: { readonly mode: ProjectMode | null }) {
  const t = useTranslations("shell.modes")
  return (
    <ChoiceList appearance="segmented" label={t("navAria")}>
      {PROJECT_MODES.map((item) => (
        <ChoiceLink key={item} appearance="segmented" to={MODE_ROUTE[item]} selected={item === mode}>
          {t(item)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
