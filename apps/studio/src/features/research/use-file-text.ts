import { useEffect, useState } from "react"
import type { FilePath } from "@/domain"
import { messageOf } from "@/lib/errors"
import { experimentRouteApi } from "@/lib/routes"

export type FileText =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly text: string }
  | { readonly kind: "failed"; readonly message: string }

type Loaded = { readonly path: FilePath; readonly text: FileText }

const LOADING: FileText = { kind: "loading" }

export function useFileText(path: FilePath): FileText {
  const { api } = experimentRouteApi.useRouteContext()
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => {
    let active = true
    void api.project.raw(path).then(
      (text) => {
        if (active) setLoaded({ path, text: { kind: "ready", text } })
      },
      (reason: unknown) => {
        if (active) setLoaded({ path, text: { kind: "failed", message: messageOf(reason) } })
      },
    )
    return () => {
      active = false
    }
  }, [api.project, path])
  if (loaded === null || loaded.path !== path) return LOADING
  return loaded.text
}
