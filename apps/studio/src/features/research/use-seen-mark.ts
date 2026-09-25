import { useEffect, useRef, useState } from "react"
import type { ExperimentSummary } from "@/domain"
import { markSeen, seenMarks, type SeenMarks } from "./viewer-memory"

export const SEEN_AFTER_MS = 3_000

export function useSeenMark(projectRoot: string, visible: readonly ExperimentSummary[]): SeenMarks | null {
  const [before] = useState(() => seenMarks(projectRoot))
  const shown = useRef<readonly ExperimentSummary[]>(visible)
  useEffect(() => {
    shown.current = visible
  }, [visible])
  useEffect(() => {
    const commit = (): void => {
      markSeen(projectRoot, shown.current)
    }
    const timer = window.setTimeout(commit, SEEN_AFTER_MS)
    window.addEventListener("pagehide", commit)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("pagehide", commit)
      commit()
    }
  }, [projectRoot])
  return before
}
