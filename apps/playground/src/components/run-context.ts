import { createContext, useContext } from "react"
import type { RunSnapshot } from "../refs/index.js"

const RunSnapshotContext = createContext<RunSnapshot | null>(null)

export const RunSnapshotProvider = RunSnapshotContext.Provider

export const useRunSnapshot = (): RunSnapshot | null => useContext(RunSnapshotContext)
