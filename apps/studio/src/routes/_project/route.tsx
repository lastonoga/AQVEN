import { createFileRoute } from "@tanstack/react-router"
import { ProjectShell } from "@/features/shell"

export const Route = createFileRoute("/_project")({
  loader: async ({ context: { api } }) => {
    const [project, flows] = await Promise.all([api.project.info(), api.project.flows()])
    return { project, flows }
  },
  component: ProjectShell,
})
