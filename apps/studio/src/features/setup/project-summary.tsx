import { useTranslations } from "use-intl"
import type { ProjectInfo, ServerInfo } from "@/domain"
import { PropertyList, type PropertyRow } from "@/components/studio"
import { useRelativeTime } from "@/i18n/format"

type ProjectTranslator = ReturnType<typeof useTranslations<"setup.project">>

const gitRow = (project: ProjectInfo, t: ProjectTranslator): PropertyRow => {
  if (project.git === null) return { key: t("git"), value: t("noGit"), tone: "neutral" }
  if (project.git.dirty) return { key: t("git"), value: t("gitDirty", { branch: project.git.branch }), tone: "warning" }
  return { key: t("git"), value: project.git.branch }
}

const configRow = (project: ProjectInfo, t: ProjectTranslator): PropertyRow =>
  project.configFile === null ? { key: t("config"), value: t("noConfig"), tone: "neutral" } : { key: t("config"), value: project.configFile }

export function ProjectProperties({ project }: { readonly project: ProjectInfo }) {
  const t = useTranslations("setup.project")
  return (
    <PropertyList
      rows={[
        { key: t("folder"), value: project.root },
        gitRow(project, t),
        configRow(project, t),
        { key: t("workflows"), value: t("workflowCount", { count: project.workflows.length }) },
      ]}
    />
  )
}

export function ServerProperties({ server }: { readonly server: ServerInfo }) {
  const t = useTranslations("setup.project")
  const ago = useRelativeTime("long")
  return (
    <PropertyList
      rows={[
        { key: t("server"), value: `${server.url} · ${server.command}` },
        { key: t("started"), value: ago(server.startedAt) },
        { key: t("projectData"), value: server.projectData },
        { key: t("studioData"), value: server.studioData },
      ]}
    />
  )
}
