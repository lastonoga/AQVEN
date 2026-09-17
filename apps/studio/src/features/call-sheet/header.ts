import { CALL_SHEET_TABS, type CallDetail, type CallSheetTab } from "@/domain"
import { NODE_KIND, type ChoiceItem, type KindSpec } from "@/components/studio"
import { rowRef, usd } from "@/lib/format"
import type { Translator } from "@/i18n/translator"

export type CallSheetHeader = {
  readonly kind: KindSpec
  readonly title: string
  readonly context: string
  readonly meta: string
}

export const callSheetHeader = (detail: CallDetail, t: Translator): CallSheetHeader => ({
  kind: NODE_KIND[detail.kind],
  title: detail.nodeId,
  context: t("callSheet.header.context", { branch: detail.branch, stage: detail.stage, row: rowRef(detail.row) }),
  meta: t("callSheet.header.meta", {
    callId: detail.id,
    attempt: detail.attempt,
    attempts: detail.attempts,
    cost: usd(detail.totalCostUsd),
  }),
})

export const callSheetTabs = (t: Translator): readonly ChoiceItem<CallSheetTab>[] =>
  CALL_SHEET_TABS.map((tab) => ({ value: tab, label: t(`domain.callSheetTab.${tab}`) }))
