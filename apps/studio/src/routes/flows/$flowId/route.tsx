import { createFileRoute } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { Shell } from "@/features/shell"
import { orNotFound } from "@/routes/-api-error"

export const Route = createFileRoute("/flows/$flowId")({
  params: {
    parse: ({ flowId }) => ({ flowId: ids.flowId(flowId) }),
    stringify: ({ flowId }) => ({ flowId }),
  },
  loader: async ({ context: { api }, params }) => {
    const [project, flows, flow] = await Promise.all([
      api.project.info(),
      api.project.flows(),
      orNotFound(api.flow.detail(params.flowId)),
    ])
    return { project, flows, flow }
  },
  component: Shell,
})
