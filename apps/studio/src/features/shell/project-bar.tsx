import { useMatch } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import { ChoiceLink, ChoiceList, Surface, Tag, Text, Toolbar } from "@/components/studio"
import { ROUTE_ID } from "@/lib/routes"
import { FlowPicker } from "./flow-picker"
import { FlowTabs } from "./flow-tabs"
import { PROJECT_SECTIONS, SECTION_ROUTE } from "./navigation"
import { projectInitial, projectName } from "./presenters"
import { RunBadge } from "./run-badge"

const SECTION_MATCH = { includeSearch: false } as const

export type ProjectBarProps = { readonly project: ApiProject; readonly flows: readonly ApiFlow[] }

function ProjectSections() {
  const t = useTranslations("shell.sections")
  return (
    <ChoiceList appearance="segmented" label={t("navAria")}>
      {PROJECT_SECTIONS.map((section) => (
        <ChoiceLink key={section} appearance="segmented" to={SECTION_ROUTE[section]} activeOptions={SECTION_MATCH}>
          {t(section)}
        </ChoiceLink>
      ))}
    </ChoiceList>
  )
}

function useOpenFlow() {
  const match = useMatch({ from: ROUTE_ID.flow, shouldThrow: false })
  return match?.loaderData?.flow ?? null
}

function FlowControls({ project, flows }: ProjectBarProps) {
  const flow = useOpenFlow()
  if (flow === null) return null
  return (
    <>
      <Text role="hint" tone="faint" aria-hidden className="shrink-0">
        /
      </Text>
      <FlowPicker project={project} flows={flows} flow={flow} />
      <FlowTabs />
    </>
  )
}

function OpenRunBadge() {
  const flow = useOpenFlow()
  if (flow === null) return null
  return <RunBadge run={flow.last_run} />
}

export function ProjectBar({ project, flows }: ProjectBarProps) {
  return (
    <Surface variant="bar" asChild>
      <Toolbar size="lg" end={<OpenRunBadge />}>
        <Tag fill="solid" tone="primary" shape="square" size="sm">
          {projectInitial(project)}
        </Tag>
        <Text role="item" weight="semibold" tone="default" className="shrink-0">
          {projectName(project)}
        </Text>
        <ProjectSections />
        <FlowControls project={project} flows={flows} />
      </Toolbar>
    </Surface>
  )
}
