import { createContext, useContext } from "react"
import type { PresentationResult, PresentationTarget } from "./presentation-data"

export type PresentationMode = "formatted" | "raw"

export type PresentationState = {
  readonly mode: PresentationMode
  readonly setMode: (mode: PresentationMode) => void
  readonly result: (target: PresentationTarget, refKey: string) => PresentationResult | null
  readonly request: (target: PresentationTarget, refKey: string) => void
}

const EMPTY_STATE: PresentationState = { mode: "formatted", setMode: () => undefined, result: () => null, request: () => undefined }

export const PresentationContext = createContext<PresentationState>(EMPTY_STATE)

export const usePresentationMode = (): PresentationMode => useContext(PresentationContext).mode
