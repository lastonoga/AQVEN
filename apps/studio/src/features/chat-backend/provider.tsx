import { useCallback, useEffect, useState, type ReactNode } from "react"
import type { ApiChatBackendChoice, ApiChatBackendKind, ApiChatBackendWrite } from "@/domain"
import { BackendSelectionContext } from "./context"

type BackendApi = {
  readonly backend: () => Promise<ApiChatBackendChoice>
  readonly selectBackend: (body: ApiChatBackendWrite) => Promise<ApiChatBackendChoice>
}

export function ChatBackendProvider({ api, children }: { readonly api: BackendApi; readonly children: ReactNode }) {
  const [backend, setBackend] = useState<ApiChatBackendKind | null>(null)
  const [pending, setPending] = useState<ApiChatBackendKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let live = true
    void api.backend().then((selected) => {
      if (live) {
        setBackend(selected.backend)
        setError(null)
      }
    }).catch((reason: unknown) => {
      if (live) setError(String(reason))
    })
    return () => { live = false }
  }, [api, revision])

  const select = useCallback(async (chosen: ApiChatBackendKind): Promise<boolean> => {
    if (pending !== null) return false
    if (chosen === backend) {
      setError(null)
      return true
    }
    setPending(chosen)
    setError(null)
    try {
      const selected = await api.selectBackend({ backend: chosen })
      setBackend(selected.backend)
      return true
    } catch (reason) {
      setError(String(reason))
      return false
    } finally {
      setPending(null)
    }
  }, [api, backend, pending])

  return (
    <BackendSelectionContext.Provider value={{ backend, pending, error, select, retry: () => { setError(null); setRevision((current) => current + 1) } }}>
      {children}
    </BackendSelectionContext.Provider>
  )
}
