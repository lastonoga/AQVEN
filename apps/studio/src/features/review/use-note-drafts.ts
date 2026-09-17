import { useState } from "react"
import type { ReviewId } from "@/domain"

export type NoteDrafts = {
  readonly read: (id: ReviewId) => string
  readonly write: (id: ReviewId, note: string) => void
}

export function useNoteDrafts(): NoteDrafts {
  const [notes, setNotes] = useState<ReadonlyMap<ReviewId, string>>(() => new Map())
  return {
    read: (id) => notes.get(id) ?? "",
    write: (id, note) => {
      setNotes((current) => new Map(current).set(id, note))
    },
  }
}
