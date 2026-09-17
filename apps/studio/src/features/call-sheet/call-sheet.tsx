import { useTranslations } from "use-intl"
import type { CallDetail, CallSheetTab } from "@/domain"
import { Empty, SectionStack, SidePanel, Tag } from "@/components/studio"
import { useRichTags } from "@/i18n/format"
import { callSheetHeader, callSheetTabs } from "./header"
import { CALL_SHEET_SECTIONS } from "./sections"

export type CallSheetProps = {
  readonly open: boolean
  readonly detail: CallDetail | null
  readonly tab: CallSheetTab
  readonly onTabChange: (tab: CallSheetTab) => void
  readonly onClose: () => void
}

type DetailSheetProps = Omit<CallSheetProps, "open" | "detail"> & { readonly detail: CallDetail }

const dismissWith =
  (onClose: () => void) =>
  (open: boolean): void => {
    if (open) return
    onClose()
  }

function MissingCallSheet({ onClose }: Pick<CallSheetProps, "onClose">) {
  const t = useTranslations()
  return (
    <SidePanel open onOpenChange={dismissWith(onClose)} title={t("callSheet.title")} closeLabel={t("common.close")}>
      <Empty title={t("common.empty.call")} />
    </SidePanel>
  )
}

function TabSections({ detail, tab }: Pick<DetailSheetProps, "detail" | "tab">) {
  const t = useTranslations()
  const tags = useRichTags()
  const sections = CALL_SHEET_SECTIONS[tab](detail, { t, tags })
  if (sections.length === 0) return <Empty title={t(`callSheet.emptyTab.${tab}`)} />
  return <SectionStack sections={sections} gap="lg" />
}

function DetailSheet({ detail, tab, onTabChange, onClose }: DetailSheetProps) {
  const t = useTranslations()
  const header = callSheetHeader(detail, t)
  return (
    <SidePanel
      open
      onOpenChange={dismissWith(onClose)}
      leading={
        <Tag size="md" tone={header.kind.tone}>
          {header.kind.code}
        </Tag>
      }
      title={header.title}
      description={header.context}
      below={[header.meta]}
      closeLabel={t("common.close")}
      tabs={{ label: t("callSheet.tabsAria"), items: callSheetTabs(t), value: tab, onValueChange: onTabChange }}
    >
      <TabSections detail={detail} tab={tab} />
    </SidePanel>
  )
}

export function CallSheet({ open, detail, ...handlers }: CallSheetProps) {
  if (!open) return null
  if (detail === null) return <MissingCallSheet onClose={handlers.onClose} />
  return <DetailSheet detail={detail} {...handlers} />
}
