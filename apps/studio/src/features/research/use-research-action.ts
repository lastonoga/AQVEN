import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import type { RouterContext } from "@/router"
import { messageOf } from "@/lib/errors"

export type ResearchApi = RouterContext["api"]["research"]

export type ActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "pending"; readonly action: string }
  | { readonly kind: "failed"; readonly message: string }

export type ResearchAction = {
  readonly state: ActionState
  readonly api: ResearchApi
  readonly pending: (action: string) => boolean
  readonly run: <T>(action: string, perform: (api: ResearchApi) => Promise<T>, done?: (value: T) => Promise<void>) => void
}

const IDLE: ActionState = { kind: "idle" }

export function useResearchAction(): ResearchAction {
  const router = useRouter()
  const api = router.options.context.api.research
  const [state, setState] = useState<ActionState>(IDLE)

  const refresh = async (): Promise<void> => {
    await router.invalidate()
  }

  const run = <T>(action: string, perform: (source: ResearchApi) => Promise<T>, done: (value: T) => Promise<void> = refresh): void => {
    if (state.kind === "pending") return
    setState({ kind: "pending", action })
    void perform(api)
      .then(done)
      .then(
        () => {
          setState(IDLE)
        },
        (reason: unknown) => {
          setState({ kind: "failed", message: messageOf(reason) })
        },
      )
  }

  return { state, api, pending: (action) => state.kind === "pending" && state.action === action, run }
}
