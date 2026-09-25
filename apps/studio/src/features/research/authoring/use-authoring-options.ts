import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { AuthoringOptions, FlowId } from "@/domain"
import { messageOf } from "@/lib/errors"

export type AuthoringOptionsState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly options: AuthoringOptions }
  | { readonly kind: "failed"; readonly message: string }

type Loaded = { readonly key: string; readonly state: AuthoringOptionsState }

const LOADING: AuthoringOptionsState = { kind: "loading" }

const ALL_FLOWS = ""

export function useAuthoringOptions(flow: FlowId | null, revision = 0): AuthoringOptionsState {
  const source = useRouter().options.context.api.authoring
  const key = `${flow ?? ALL_FLOWS}#${String(revision)}`
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => {
    let active = true
    void source.options(flow).then(
      (options) => {
        if (active) setLoaded({ key, state: { kind: "ready", options } })
      },
      (reason: unknown) => {
        if (active) setLoaded({ key, state: { kind: "failed", message: messageOf(reason) } })
      },
    )
    return () => {
      active = false
    }
  }, [source, flow, key])
  if (loaded === null || loaded.key !== key) return LOADING
  return loaded.state
}
