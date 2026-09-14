import type { ReactNode } from "react"
import { NodeOverviewTab } from "./NodeOverviewTab.js"
import { NodeInputTab } from "./NodeInputTab.js"
import { NodeOutputTab } from "./NodeOutputTab.js"
import { NodePromptTab } from "./NodePromptTab.js"
import { NodeSourceTab } from "./NodeSourceTab.js"
import { embeddedLlm } from "./ir-value.js"
import type { InspectorContext } from "./inspector-context.js"

export type TabId = "overview" | "input" | "output" | "prompt" | "source"

export type TabSpec = {
  id: TabId
  label: string
  visible: (context: InspectorContext) => boolean
  component: (context: InspectorContext) => ReactNode
}

const always = (): boolean => true

export const inspectorTabs: readonly TabSpec[] = [
  { id: "overview", label: "Обзор", visible: always, component: NodeOverviewTab },
  { id: "input", label: "Вход", visible: always, component: NodeInputTab },
  { id: "output", label: "Выход", visible: always, component: NodeOutputTab },
  {
    id: "prompt",
    label: "Промт",
    visible: (context) => embeddedLlm(context.body) !== null,
    component: NodePromptTab,
  },
  { id: "source", label: "Исходник", visible: always, component: NodeSourceTab },
]

export const visibleTabs = (context: InspectorContext): readonly TabSpec[] =>
  inspectorTabs.filter((tab) => tab.visible(context))
