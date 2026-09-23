import { useTranslations } from "use-intl"
import { ChoiceLink, ChoiceList } from "@/components/studio"
import type { FlowId } from "@/domain"
import { ROUTE_PATH } from "@/lib/routes"
import { listSearch, RUN_LISTS, type RunList } from "./run-list"

export type RunListChoiceProps = { readonly flowId: FlowId; readonly list: RunList }

export function RunListChoice({ flowId, list }: RunListChoiceProps) {
  const t = useTranslations("runs.lists")
  return (
    <ChoiceList appearance="segmented" label={t("aria")}>
      {RUN_LISTS.map((item) => (
        <ChoiceLink key={item} appearance="segmented" size="sm" to={ROUTE_PATH.runs} params={{ flowId }} search={listSearch(item)} selected={item === list}>
          {t(`${item}.label`)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}
