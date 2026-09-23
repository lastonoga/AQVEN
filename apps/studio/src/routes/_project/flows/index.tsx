import { createFileRoute } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { FlowsScreen, type FlowDescriptions } from "@/features/flows"

export const Route = createFileRoute("/_project/flows/")({
  loader: async ({ context: { api } }) => {
    const [flows, experiments] = await Promise.all([api.project.flows(), api.research.experiments()])
    const details = await Promise.all(flows.map(async (flow) => api.flow.detail(ids.flowId(flow.flow_id)).catch(() => null)))
    const descriptions: FlowDescriptions = Object.fromEntries(details.flatMap((detail) => (detail === null ? [] : [[detail.flow_id, detail.description]])))
    return { flows, descriptions, experiments }
  },
  component: FlowsScreen,
})
