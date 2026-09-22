import { useState } from "react"
import { useTranslations } from "use-intl"
import { SplitPane, Surface, type SplitPanel } from "@/components/studio"
import { ChatPanel } from "@/features/chat"
import { SettingsDialog } from "@/features/setup"
import { flowRouteApi } from "@/lib/routes"
import { FlowFrame } from "./flow-frame"

const CHAT_PANEL: Omit<SplitPanel, "content"> = { id: "chat", defaultSize: 352, minSize: 280, maxSize: 680, fixed: true }
const WORKSPACE_PANEL: Omit<SplitPanel, "content"> = { id: "workspace", minSize: 560 }

export function Shell() {
  const { project, flows, flow } = flowRouteApi.useLoaderData()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const t = useTranslations("shell")
  const panels: readonly SplitPanel[] = [
    { ...CHAT_PANEL, content: <ChatPanel /> },
    { ...WORKSPACE_PANEL, content: <FlowFrame project={project} flows={flows} flow={flow} onOpenSettings={() => { setSettingsOpen(true) }} /> },
  ]
  return (
    <div className="relative h-full min-w-[1180px] overflow-hidden">
      <Surface variant="plain" aria-hidden className="dark absolute inset-0" />
      <div className="relative h-full">
        <SplitPane
          id="shell"
          orientation="horizontal"
          handle="ghost"
          handleClassName="dark"
          handleLabel={t("resizeChatAria")}
          panels={panels}
        />
      </div>
      {settingsOpen ? (
        <SettingsDialog
          project={project}
          onClose={() => { setSettingsOpen(false) }}
        />
      ) : null}
    </div>
  )
}
