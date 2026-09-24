import { useState, type ReactNode } from "react"
import type { NodeKind } from "@/domain"
import { Dot, NODE_KIND, SidePanel, Tag, ValueDisplayProvider } from "@/components/studio"
import { PresentationModeChoice, type PresentationMode } from "@/features/runs"

export type InspectorPage<V extends string> = {
  readonly value: V
  readonly label: string
  readonly render: (raw: boolean) => ReactNode
  readonly presentation?: boolean
}

export type InspectorPanelProps<V extends string> = {
  readonly kind: NodeKind
  readonly title: string
  readonly description: string | null
  readonly closeLabel: string
  readonly tabsLabel: string
  readonly pages: readonly InspectorPage<V>[]
  readonly onClose: () => void
}

const pageOf = <V extends string>(pages: readonly InspectorPage<V>[], selected: V | null): InspectorPage<V> | undefined =>
  pages.find((page) => page.value === selected) ?? pages[0]

export function InspectorPanel<V extends string>({ kind, title, description, closeLabel, tabsLabel, pages, onClose }: InspectorPanelProps<V>) {
  const [selected, setSelected] = useState<V | null>(null)
  const [mode, setMode] = useState<PresentationMode>("formatted")
  const active = pageOf(pages, selected)
  const tone = NODE_KIND[kind]
  if (active === undefined) return null
  return (
    <SidePanel
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      leading={<Dot tone={tone.tone} />}
      title={title}
      description={description}
      aside={
        <Tag size="sm" tone={tone.tone} fill="tint">
          {tone.code}
        </Tag>
      }
      closeLabel={closeLabel}
      tabs={{ label: tabsLabel, items: pages.map((page) => ({ value: page.value, label: page.label })), value: active.value, onValueChange: setSelected }}
    >
      <ValueDisplayProvider mode={mode === "raw" ? "json" : "flat"}>
        {active.presentation === false ? null : (
          <div className="mb-3 flex justify-end gap-2">
            <PresentationModeChoice mode={mode} onValueChange={setMode} />
          </div>
        )}
        {active.render(mode === "raw")}
      </ValueDisplayProvider>
    </SidePanel>
  )
}
