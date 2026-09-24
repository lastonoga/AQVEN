import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { settingKey } from "@/data/ids"
import { saveFailureOf, type SaveFailure } from "./presenters"

export type KeyEditorMode = "view" | "edit"

export type KeyEditor = {
  readonly mode: KeyEditorMode
  readonly pending: boolean
  readonly failure: SaveFailure | null
  readonly edit: () => void
  readonly cancel: () => void
  readonly save: (secret: string) => void
  readonly remove: () => void
}

export function useKeyEditor(key: string, onChanged: () => Promise<void>): KeyEditor {
  const { api } = useRouter().options.context
  const [mode, setMode] = useState<KeyEditorMode>("view")
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<SaveFailure | null>(null)

  const settle = (write: () => Promise<unknown>): void => {
    if (pending) return
    setPending(true)
    setFailure(null)
    void write()
      .then(onChanged)
      .then(
        () => {
          setPending(false)
          setMode("view")
        },
        (reason: unknown) => {
          setPending(false)
          setFailure(saveFailureOf(reason))
        },
      )
  }

  const switchTo = (next: KeyEditorMode): void => {
    setFailure(null)
    setMode(next)
  }

  return {
    mode,
    pending,
    failure,
    edit: () => {
      switchTo("edit")
    },
    cancel: () => {
      switchTo("view")
    },
    save: (secret) => {
      settle(() => api.settings.putSecret(settingKey(key), secret))
    },
    remove: () => {
      settle(() => api.settings.deleteSetting(settingKey(key)))
    },
  }
}
