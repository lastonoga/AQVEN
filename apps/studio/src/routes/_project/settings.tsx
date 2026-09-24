import { createFileRoute } from "@tanstack/react-router"
import { SettingsScreen } from "@/features/setup"

export const Route = createFileRoute("/_project/settings")({
  loader: async ({ context: { api } }) => ({ project: await api.project.info() }),
  component: SettingsScreen,
})
