import { Outlet } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import { SplitPane, Surface, type SplitPanel } from "@/components/studio"
import { ChatPanel } from "@/features/chat"
import { ChatHandoffProvider } from "@/features/chat-handoff"
import { projectRouteApi } from "@/lib/routes"
import { ProjectBar } from "./project-bar"

const CHAT_PANEL: Omit<SplitPanel, "content"> = { id: "chat", defaultSize: 352, minSize: 280, maxSize: 680, fixed: true }
const WORKSPACE_PANEL: Omit<SplitPanel, "content"> = { id: "workspace", minSize: 560 }

function Workspace({ project, flows }: { readonly project: ApiProject; readonly flows: readonly ApiFlow[] }) {
  return (
    <div className="h-full min-h-0 min-w-0 pt-2 pr-2 pb-2">
      <Surface variant="frame" className="grid h-full grid-rows-[48px_minmax(0,1fr)]">
        <ProjectBar project={project} flows={flows} />
        <div className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <Outlet />
        </div>
      </Surface>
    </div>
  )
}

export function ProjectShell() {
  const { project, flows } = projectRouteApi.useLoaderData()
  const t = useTranslations("shell")
  const panels: readonly SplitPanel[] = [
    { ...CHAT_PANEL, content: <ChatPanel /> },
    { ...WORKSPACE_PANEL, content: <Workspace project={project} flows={flows} /> },
  ]
  return (
    <ChatHandoffProvider>
      <div className="relative h-full min-w-[1180px] overflow-hidden">
        <Surface variant="plain" aria-hidden className="dark absolute inset-0" />
        <div className="relative h-full">
          <SplitPane id="shell" orientation="horizontal" handle="ghost" handleClassName="dark" handleLabel={t("resizeChatAria")} panels={panels} />
        </div>
      </div>
    </ChatHandoffProvider>
  )
}
