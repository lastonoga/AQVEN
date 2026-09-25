import { useState } from "react"
import { readViewerItem, writeViewerItem } from "@/lib/viewer-storage"

export type ChatVisibility = {
  readonly open: boolean
  readonly toggle: () => void
  readonly show: () => void
  readonly setOpen: (open: boolean) => void
}

export const CHAT_VISIBILITY_KEY = "aqven:chat:panel"

const CLOSED = "closed"
const OPEN = "open"

const storedOpen = (): boolean => readViewerItem(CHAT_VISIBILITY_KEY) !== CLOSED

export function useChatVisibility(): ChatVisibility {
  const [open, setOpen] = useState(storedOpen)
  const apply = (next: boolean): void => {
    setOpen(next)
    writeViewerItem(CHAT_VISIBILITY_KEY, next ? OPEN : CLOSED)
  }
  return {
    open,
    toggle: () => {
      apply(!open)
    },
    show: () => {
      apply(true)
    },
    setOpen: apply,
  }
}
