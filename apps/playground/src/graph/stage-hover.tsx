import { createContext, useContext, useMemo, useState } from "react"
import type { ReactNode } from "react"

type StageHover = {
  hovered: number | null
  setHovered: (rank: number | null) => void
}

const StageHoverContext = createContext<StageHover>({ hovered: null, setHovered: () => undefined })

export const useStageHover = (): StageHover => useContext(StageHoverContext)

export function StageHoverProvider({ children }: { children: ReactNode }) {
  const [hovered, setHovered] = useState<number | null>(null)
  const value = useMemo(() => ({ hovered, setHovered }), [hovered])
  return <StageHoverContext.Provider value={value}>{children}</StageHoverContext.Provider>
}
