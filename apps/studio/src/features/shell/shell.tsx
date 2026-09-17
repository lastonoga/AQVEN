import { useTranslations } from "use-intl"
import { SplitPane, Surface, type SplitPanel } from "@/components/studio"
import { ChatPanel } from "@/features/chat"
import { shellRouteApi } from "@/lib/routes"
import { WorkflowPicker } from "./workflow-picker"
import { WorkspaceFrame } from "./workspace-frame"

const CHAT_PANEL: Omit<SplitPanel, "content"> = { id: "chat", defaultSize: 352, minSize: 280, maxSize: 680, fixed: true }
const WORKSPACE_PANEL: Omit<SplitPanel, "content"> = { id: "workspace", minSize: 560 }

export function Shell() {
  const { shell } = shellRouteApi.useLoaderData()
  const t = useTranslations("shell")
  const panels: readonly SplitPanel[] = [
    { ...CHAT_PANEL, content: <ChatPanel header={<WorkflowPicker shell={shell} />} /> },
    { ...WORKSPACE_PANEL, content: <WorkspaceFrame latestRun={shell.latestRun} /> },
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
    </div>
  )
}
