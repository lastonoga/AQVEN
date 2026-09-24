import { useEffect, type ReactNode } from "react"
import { Link, useMatch } from "@tanstack/react-router"
import { Settings } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import { Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { rememberFlow } from "@/lib/last-flow"
import { ROUTE_ID, ROUTE_PATH } from "@/lib/routes"
import type { PickerTargets } from "./flow-items"
import { FlowPicker } from "./flow-picker"
import { FlowTabs } from "./flow-tabs"
import { ModeSwitch } from "./mode-switch"
import { useCurrentMode, type ProjectMode } from "./navigation"
import { projectInitial, projectName } from "./presenters"
import { ResearchTabs } from "./research-tabs"
import { RunBadge } from "./run-badge"
import { fallbackFlow, useRoutedFlow, type FlowScope } from "./selected-flow"

export type ProjectBarProps = { readonly project: ApiProject; readonly flows: readonly ApiFlow[] }

type MenuProps = { readonly selected: FlowScope }

const PICKER_OF_MODE: Readonly<Record<ProjectMode, PickerTargets>> = { flow: "flow", research: "research" }

function Divider() {
  return <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
}

function FlowMenu({ selected }: MenuProps) {
  if (selected === null) return null
  return (
    <>
      <Divider />
      <FlowTabs flowId={selected} />
    </>
  )
}

function ResearchMenu({ selected }: MenuProps) {
  return (
    <>
      <Divider />
      <ResearchTabs selected={selected} />
    </>
  )
}

const MODE_MENU: Readonly<Record<ProjectMode, (props: MenuProps) => ReactNode>> = {
  flow: FlowMenu,
  research: ResearchMenu,
}

function ModeMenu({ mode, selected }: MenuProps & { readonly mode: ProjectMode | null }) {
  if (mode === null) return null
  const Menu = MODE_MENU[mode]
  return <Menu selected={selected} />
}

function FlowCrumb({ project, flows, selected, mode }: ProjectBarProps & MenuProps & { readonly mode: ProjectMode | null }) {
  if (flows.length === 0) return null
  return (
    <>
      <Text role="item" tone="neutral" aria-hidden className="shrink-0">
        /
      </Text>
      <FlowPicker project={project} flows={flows} selected={selected} targets={mode === null ? "flow" : PICKER_OF_MODE[mode]} />
    </>
  )
}

function OpenRunBadge() {
  const match = useMatch({ from: ROUTE_ID.flow, shouldThrow: false })
  const flow = match?.loaderData?.flow ?? null
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

function useSelectedFlow(project: ApiProject, flows: readonly ApiFlow[]): FlowScope {
  const routed = useRoutedFlow()
  const remembered = routed ?? null
  useEffect(() => {
    if (remembered === null) return
    rememberFlow(project.root, remembered)
  }, [project.root, remembered])
  return routed === undefined ? fallbackFlow(project, flows) : routed
}

export function ProjectBar({ project, flows }: ProjectBarProps) {
  const t = useTranslations("shell")
  const mode = useCurrentMode()
  const selected = useSelectedFlow(project, flows)
  return (
    <Surface variant="bar" asChild>
      <Toolbar
        size="lg"
        className="gap-3 pr-2 pl-3.5"
        end={
          <>
            <OpenRunBadge />
            <SettingsButton />
          </>
        }
      >
        <nav aria-label={t("crumbsAria")} className="flex min-w-0 shrink items-center gap-1.5">
          <Tag fill="solid" tone="primary" shape="square" size="sm">
            {projectInitial(project)}
          </Tag>
          <Text role="item" weight="semibold" tone="default" className="shrink-0">
            {projectName(project)}
          </Text>
          <FlowCrumb project={project} flows={flows} selected={selected} mode={mode} />
        </nav>
        <Divider />
        <ModeSwitch mode={mode} selected={selected} />
        <ModeMenu mode={mode} selected={selected} />
      </Toolbar>
    </Surface>
  )
}
