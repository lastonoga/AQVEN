import { createContext, useContext } from "react"
import type { ReactNode } from "react"

export type GroupCollapse = {
  collapsed: ReadonlySet<string>
  toggle: (id: string) => void
}

const EMPTY: GroupCollapse = { collapsed: new Set(), toggle: () => undefined }

const GroupCollapseContext = createContext<GroupCollapse>(EMPTY)

export const useGroupCollapse = (): GroupCollapse => useContext(GroupCollapseContext)

export function GroupCollapseProvider({ value, children }: { value: GroupCollapse; children: ReactNode }) {
  return <GroupCollapseContext.Provider value={value}>{children}</GroupCollapseContext.Provider>
}

export const toggleIn = (collapsed: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(collapsed)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
