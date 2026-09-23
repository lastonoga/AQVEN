import { createFileRoute } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { orNotFound } from "@/routes/-api-error"

export const Route = createFileRoute("/_project/flows/$flowId")({
  params: {
    parse: ({ flowId }) => ({ flowId: ids.flowId(flowId) }),
    stringify: ({ flowId }) => ({ flowId }),
  },
  loader: async ({ context: { api }, params }) => {
    const flow = await orNotFound(api.flow.detail(params.flowId))
    return { flow }
  },
})
