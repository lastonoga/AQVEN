import type { ApiNodeDetail, ApiPromptDetail } from "@/domain"

export const NODE_TABS = ["definition", "prompt", "schemas", "problems"] as const

export type NodeTab = (typeof NODE_TABS)[number]

export type TabContext = { readonly detail: ApiNodeDetail; readonly prompt: ApiPromptDetail | null }

const DEFAULT_TAB: NodeTab = "definition"

const hasSchema = (value: unknown): boolean => value !== null && value !== undefined

const NODE_TAB_AVAILABLE: Readonly<Record<NodeTab, (context: TabContext) => boolean>> = {
  definition: () => true,
  prompt: ({ prompt }) => prompt !== null,
  schemas: ({ detail }) => hasSchema(detail.in_schema) || hasSchema(detail.out_schema) || hasSchema(detail.form_schema),
  problems: ({ detail }) => detail.problems.length > 0,
}

export const availableTabs = (context: TabContext): readonly NodeTab[] =>
  NODE_TABS.filter((tab) => NODE_TAB_AVAILABLE[tab](context))

export const resolveTab = (context: TabContext, requested: NodeTab | undefined): NodeTab => {
  if (requested === undefined) return DEFAULT_TAB
  return NODE_TAB_AVAILABLE[requested](context) ? requested : DEFAULT_TAB
}
