import { useTranslations } from "use-intl"
import { Dot, Empty, EXECUTION_STATUS_TONE, NODE_KIND, SectionStack, SidePanel, Tag, type ChoiceItem } from "@/components/studio"
import { PresentationModeSwitch, usePresentationMode } from "@/features/runs"
import { joinMeta } from "@/lib/format"
import { CALL_SHEET_TABS, type CallDetail, type CallSheetTab } from "./model"
import { CALL_SHEET_SECTIONS } from "./sections"
import { ModelCard } from "./model-card"

export type CallSheetProps = {
  readonly detail: CallDetail | null
  readonly tab: CallSheetTab
  readonly onTabChange: (tab: CallSheetTab) => void
  readonly onClose: () => void
}

const dismissWith =
  (onClose: () => void) =>
  (open: boolean): void => {
    if (open) return
    onClose()
  }

function TabSections({ detail, tab }: Pick<CallSheetProps, "detail" | "tab"> & { readonly detail: CallDetail }) {
  const t = useTranslations()
  const none = useTranslations("common")("none")
  const mode = usePresentationMode()
  if (tab === "model") return <ModelCard execution={detail.execution} />
  const sections = CALL_SHEET_SECTIONS[tab](detail, { t, none, raw: mode === "raw" })
  if (sections.length === 0) return <Empty title={t(`callSheet.emptyTab.${tab}`)} />
  return (
    <div>
      <div className="mb-3 flex justify-end gap-2">
        <PresentationModeSwitch />
      </div>
      <SectionStack sections={sections} gap="lg" />
    </div>
  )
}

export function CallSheet({ detail, tab, onTabChange, onClose }: CallSheetProps) {
  const t = useTranslations("callSheet")
  const label = useTranslations("callSheet.tab")
  const status = useTranslations("domain.executionStatus")
  if (detail === null) return null
  const { execution } = detail
  const address = execution.address
  const items: readonly ChoiceItem<CallSheetTab>[] = CALL_SHEET_TABS.map((value) => ({ value, label: label(value) }))
  return (
      <SidePanel
        open
        onOpenChange={dismissWith(onClose)}
        leading={<Dot tone={EXECUTION_STATUS_TONE[execution.status]} />}
        title={address.node_id}
        description={joinMeta([
          status(execution.status),
          address.branch_key === null ? null : t("address.branch", { value: address.branch_key }),
          address.iteration === null ? null : t("address.iteration", { value: address.iteration }),
          address.item_index === null ? null : t("address.item", { value: address.item_index }),
        ])}
        aside={
          <Tag size="sm" tone={NODE_KIND[execution.kind].tone} fill="tint">
            {NODE_KIND[execution.kind].code}
          </Tag>
        }
        closeLabel={t("closeAria")}
        tabs={{ label: t("tabsAria"), items, value: tab, onValueChange: onTabChange }}
      >
        <TabSections detail={detail} tab={tab} />
      </SidePanel>
  )
}
