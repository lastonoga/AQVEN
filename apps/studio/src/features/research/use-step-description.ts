import { useEffect, useState } from "react"
import * as ids from "@/data/ids"
import { specDescription } from "@/features/flow"
import { noop } from "@/lib/noop"
import { experimentRouteApi } from "@/lib/routes"
import type { StepDescription } from "./graph-model"

type RemoteDescription = Extract<StepDescription, { readonly kind: "remote" }>

function useRemoteDescription(remote: RemoteDescription | null): string | null {
  const { api } = experimentRouteApi.useRouteContext()
  const [text, setText] = useState<string | null>(null)
  const flow = remote?.flow ?? null
  const node = remote?.node ?? null
  useEffect(() => {
    if (flow === null || node === null) return
    let active = true
    void api.flow.node(flow, ids.nodeId(node)).then((detail) => {
      if (active) setText(specDescription(detail))
    }, noop)
    return () => {
      active = false
    }
  }, [api.flow, flow, node])
  return text
}

export function useStepDescription(description: StepDescription): string | null {
  const remote = useRemoteDescription(description.kind === "remote" ? description : null)
  if (description.kind === "remote") return remote
  return description.text
}
