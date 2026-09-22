import { createFileRoute } from "@tanstack/react-router"
import { ProjectScreen } from "@/features/project"

export const Route = createFileRoute("/project")({
  loader: async ({ context: { api } }) => {
    const [project, flows] = await Promise.all([api.project.info(), api.project.flows()])
    return { project, flows }
  },
  component: ProjectScreen,
})
