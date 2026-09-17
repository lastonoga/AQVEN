import { useTranslations } from "use-intl"
import { INSPECTOR_TABS, type InspectorTab, type NodeInspection } from "@/domain"
import { Empty, Heading, NODE_KIND, PanelLayout, SectionStack, Surface, Tag, Text } from "@/components/studio"
import { INSPECTOR_SECTIONS } from "./inspector-sections"
import { useInspectorContext } from "./use-inspector-context"

export type InspectorProps = {
  readonly inspection: NodeInspection | null
  readonly tab: InspectorTab
  readonly onTabChange: (tab: InspectorTab) => void
}

export function Inspector({ inspection, tab, onTabChange }: InspectorProps) {
  const t = useTranslations()
  const context = useInspectorContext()
  if (inspection === null) {
    return (
      <Surface variant="plain" className="h-full p-3">
        <Empty title={t("common.empty.inspector")} />
      </Surface>
    )
  }
  const kind = NODE_KIND[inspection.kind]
  return (
    <Surface variant="plain" className="h-full">
      <PanelLayout
        inset="md"
        header={
          <Heading
            size="item"
            leading={<Tag tone={kind.tone}>{kind.code}</Tag>}
            title={inspection.name}
            trailing={
              <Text role="micro" tone="neutral">
                {t("schema.inspector.shortcutHint")}
              </Text>
            }
          />
        }
        tabs={{
          label: t("schema.inspector.tabsAria"),
          items: INSPECTOR_TABS.map((value) => ({ value, label: t(`domain.inspectorTab.${value}`) })),
          value: tab,
          onValueChange: onTabChange,
        }}
      >
        <SectionStack sections={INSPECTOR_SECTIONS[tab](inspection, context)} gap="md" />
      </PanelLayout>
    </Surface>
  )
}
