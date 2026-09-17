import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { DatasetRow } from "@/domain"
import { Text } from "@/components/studio"
import { rowNavigation } from "./navigation"
import { RowJump } from "./row-jump"
import { RowPicker } from "./row-picker"

export type NavigatorControlsProps = {
  readonly rows: readonly DatasetRow[]
  readonly row: DatasetRow
  readonly total: number
  readonly failures: boolean
}

export function NavigatorControls({ rows, row, total, failures }: NavigatorControlsProps) {
  const t = useTranslations("testDetail.navigator")
  const navigation = rowNavigation(rows, row, failures)
  return (
    <div className="flex items-center gap-1.5">
      <RowJump target={navigation.previous} label={t("previousAria")} variant="outline" size="icon">
        <ArrowLeft aria-hidden />
      </RowJump>
      <Text role="item" weight="medium" tone="neutral" className="inline-flex min-w-16 justify-center">
        {t("position", { ordinal: row.ordinal, total })}
      </Text>
      <RowJump target={navigation.next} label={t("nextAria")} variant="outline" size="icon">
        <ArrowRight aria-hidden />
      </RowJump>
      <RowJump target={navigation.nextFailure} label={t("nextFailure")} variant="default" size="sm">
        {t("nextFailure")}
      </RowJump>
      <RowPicker rows={rows} total={total} />
    </div>
  )
}
