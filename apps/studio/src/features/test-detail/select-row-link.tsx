import { useTranslations } from "use-intl"
import type { RowId } from "@/domain"
import { RowLink } from "@/components/studio"
import { rowRef } from "@/lib/format"
import { ROUTE_ID } from "@/lib/routes"
import { selectRowSearch } from "./navigation"

export function SelectRowLink({ rowId }: { readonly rowId: RowId }) {
  const t = useTranslations("testDetail.navigator")
  return (
    <RowLink
      from={ROUTE_ID.testDetail}
      to="."
      search={selectRowSearch(rowId)}
      resetScroll={false}
      aria-label={t("rowAria", { row: rowRef(rowId) })}
    />
  )
}
