import type { ChatThread } from "@/domain"
import { shellRouteApi } from "@/lib/routes"

export const useChatThread = (): ChatThread => shellRouteApi.useLoaderData({ select: (data) => data.chat })

export const useChatScope = (): string => {
  const { workspaceId, workflowId } = shellRouteApi.useParams()
  return `${workspaceId}/${workflowId}`
}
