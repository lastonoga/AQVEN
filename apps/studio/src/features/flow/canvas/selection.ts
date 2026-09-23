import { createContext } from "react"

export const SelectedNodeContext = createContext<string | null>(null)
export const HoveredNodeContext = createContext<string | null>(null)
