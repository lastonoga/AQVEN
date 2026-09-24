import { useEffect, useState } from "react"
import type { ApiPromptDetail } from "@/domain"
import * as ids from "@/data/ids"
import { messageOf } from "@/lib/errors"
import { experimentRouteApi } from "@/lib/routes"
import type { StepPrompt } from "./graph-model"

export type PromptState =
  | { readonly kind: "none" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly prompt: ApiPromptDetail }
  | { readonly kind: "failed"; readonly message: string }

type RemotePrompt = Extract<StepPrompt, { readonly kind: "remote" }>

const LOADING: PromptState = { kind: "loading" }

function useRemotePrompt(remote: RemotePrompt | null): PromptState {
  const { api } = experimentRouteApi.useRouteContext()
  const [state, setState] = useState<PromptState>(LOADING)
  const flow = remote?.flow ?? null
  const node = remote?.node ?? null
  useEffect(() => {
    if (flow === null || node === null) return
    let active = true
    void api.flow.prompt(flow, ids.nodeId(node)).then(
      (prompt) => {
        if (active) setState({ kind: "ready", prompt })
      },
      (reason: unknown) => {
        if (active) setState({ kind: "failed", message: messageOf(reason) })
      },
    )
    return () => {
      active = false
    }
  }, [api.flow, flow, node])
  return state
}

export function useStepPrompt(prompt: StepPrompt): PromptState {
  const remote = useRemotePrompt(prompt.kind === "remote" ? prompt : null)
  if (prompt.kind === "remote") return remote
  return prompt
}
