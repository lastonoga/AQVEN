import { useEffect, type ReactNode } from "react"
import { Link, useMatch } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import { Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { rememberFlow } from "@/lib/last-flow"
import { ROUTE_ID, ROUTE_PATH } from "@/lib/routes"
import { FlowPicker } from "./flow-picker"
import { FlowTabs } from "./flow-tabs"
import { ModeSwitch } from "./mode-switch"
import { useCurrentMode, type ProjectMode } from "./navigation"
import { projectInitial, projectName } from "./presenters"
import { ResearchTabs } from "./research-tabs"
import { RunBadge } from "./run-badge"

export type ProjectBarProps = { readonly project: ApiProject; readonly flows: readonly ApiFlow[] }

function useOpenFlow() {
  const match = useMatch({ from: ROUTE_ID.flow, shouldThrow: false })
  return match?.loaderData?.flow ?? null
}

function FlowControls({ project, flows }: ProjectBarProps) {
  const flow = useOpenFlow()
  const openId = flow?.flow_id ?? null
  useEffect(() => {
    if (openId === null) return
    rememberFlow(project.root, openId)
  }, [project.root, openId])
  if (flow === null) return null
  return (
    <>
      <FlowPicker project={project} flows={flows} flow={flow} />
      <FlowTabs />
    </>
  )
}

const MODE_MENU: Readonly<Record<ProjectMode, (props: ProjectBarProps) => ReactNode>> = {
  flow: FlowControls,
  research: ResearchTabs,
}

function ModeMenu({ mode, ...props }: ProjectBarProps & { readonly mode: ProjectMode | null }) {
  if (mode === null) return null
  const Menu = MODE_MENU[mode]
  return <Menu {...props} />
}

function OpenRunBadge() {
  const flow = useOpenFlow()
  if (flow === null) return null
  return <RunBadge run={flow.last_run} />
}

function SettingsButton() {
  const t = useTranslations("shell")
  return (
    <Button variant="ghost" size="icon" asChild>
      <Link to={ROUTE_PATH.settings} aria-label={t("settingsAria")} title={t("settingsAria")} activeProps={{ "aria-current": "page" }}>
        <Settings className="size-4" />
      </Link>
    </Button>
  )
}

export function ProjectBar({ project, flows }: ProjectBarProps) {
  const mode = useCurrentMode()
  return (
    <Surface variant="bar" asChild>
      <Toolbar
        size="lg"
        end={
          <>
            <OpenRunBadge />
            <SettingsButton />
          </>
        }
      >
        <Tag fill="solid" tone="primary" shape="square" size="sm">
          {projectInitial(project)}
        </Tag>
        <Text role="item" weight="semibold" tone="default" className="shrink-0">
          {projectName(project)}
        </Text>
        <ModeSwitch mode={mode} />
        <ModeMenu mode={mode} project={project} flows={flows} />
      </Toolbar>
    </Surface>
  )
}
