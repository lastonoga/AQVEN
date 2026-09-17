import { useTranslations } from "use-intl"
import { MODES } from "@/domain"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import { shellRouteApi } from "@/lib/routes"
import { MODE_ROUTE } from "./navigation"

const PATH_ONLY = { includeSearch: false } as const

export function ModeTabs() {
  const t = useTranslations("shell.modes")
  const modeLabel = useTranslations("domain.mode")
  const params = shellRouteApi.useParams()
  return (
    <ChoiceList appearance="segmented" label={t("navAria")}>
      {MODES.map((mode) => (
        <ChoiceLink key={mode} appearance="segmented" to={MODE_ROUTE[mode]} params={params} activeOptions={PATH_ONLY}>
          {modeLabel(mode)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
