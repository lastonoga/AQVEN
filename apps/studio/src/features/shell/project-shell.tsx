import { Outlet } from "@tanstack/react-router"
import { cn } from "cn"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import { SplitPane, Surface, type SplitPanel } from "@/components/studio"
import { ChatPanel } from "@/features/chat"
import { ChatHandoffProvider } from "@/features/chat-handoff"
import { ServerDownBanner, ServerHealthProvider, ServerNoticeToast } from "@/features/health"
import { projectRouteApi } from "@/lib/routes"
import { useChatVisibility, type ChatVisibility } from "./chat-visibility"
import { ProjectBar } from "./project-bar"

const CHAT_PANEL_ID = "chat"

const CHAT_PANEL: Omit<SplitPanel, "content"> = { id: CHAT_PANEL_ID, defaultSize: 352, minSize: 280, maxSize: 680, fixed: true }
const WORKSPACE_PANEL: Omit<SplitPanel, "content"> = { id: "workspace", minSize: 560 }

type WorkspaceProps = { readonly project: ApiProject; readonly flows: readonly ApiFlow[]; readonly chat: ChatVisibility }

function Workspace({ project, flows, chat }: WorkspaceProps) {
  return (
    <div className={cn("h-full min-h-0 min-w-0 pt-2 pr-2 pb-2", !chat.open && "pl-2")}>
      <Surface variant="frame" className="grid h-full grid-rows-[48px_minmax(0,1fr)]">
        <ProjectBar project={project} flows={flows} chat={chat} chatPanelId={CHAT_PANEL_ID} />
        <div className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] overflow-hidden">
          <Outlet />
        </div>
      </Surface>
    </div>
  )
}

export function ProjectShell() {
  const { project, flows } = projectRouteApi.useLoaderData()
  const { api } = projectRouteApi.useRouteContext()
  const t = useTranslations("shell")
  const chat = useChatVisibility()
  const panels: readonly SplitPanel[] = [
    { ...CHAT_PANEL, collapsed: !chat.open, onCollapsedChange: (collapsed) => { chat.setOpen(!collapsed) }, content: <ChatPanel /> },
    { ...WORKSPACE_PANEL, content: <Workspace project={project} flows={flows} chat={chat} /> },
  ]
  return (
    <ServerHealthProvider source={api.server}>
      <ChatHandoffProvider onAnnounce={chat.show}>
        <div className="relative h-full min-w-[1180px] overflow-hidden">
          <Surface variant="plain" aria-hidden className="dark absolute inset-0" />
          <div className="relative flex h-full flex-col">
            <ServerDownBanner fallbackRoot={project.root} />
            <div className="min-h-0 flex-1">
              <SplitPane id="shell" orientation="horizontal" handle="ghost" handleClassName="dark" handleLabel={t("resizeChatAria")} panels={panels} />
            </div>
          </div>
        </div>
        <ServerNoticeToast />
      </ChatHandoffProvider>
    </ServerHealthProvider>
  )
}
