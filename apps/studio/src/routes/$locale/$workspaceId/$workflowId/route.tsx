import { createFileRoute, notFound } from "@tanstack/react-router"
import * as ids from "@/data/ids"
import { Shell } from "@/features/shell"

export const Route = createFileRoute("/$locale/$workspaceId/$workflowId")({
  params: {
    parse: ({ workspaceId, workflowId }) => ({ workspaceId: ids.workspaceId(workspaceId), workflowId: ids.workflowId(workflowId) }),
    stringify: ({ workspaceId, workflowId }) => ({ workspaceId, workflowId }),
  },
  loader: async ({ context: { sources }, params }) => {
    const shell = await sources.workspace.shell(params)
    if (shell === null) throw notFound()
    return { shell, chat: await sources.chat.thread(params) }
  },
  component: Shell,
})
