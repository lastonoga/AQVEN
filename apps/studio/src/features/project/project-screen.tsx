import type { JSX } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import {
  COMPILE_STATUS_TONE,
  Empty,
  Heading,
  INDEX_STATUS_TONE,
  Page,
  PropertyList,
  Surface,
  Tag,
  TitledPanel,
  type PropertyRow,
  type Tone,
} from "@/components/studio"
import { flowId as toFlowId, isoDateTime } from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import type { Translator } from "@/i18n/translator"
import { projectRouteApi, ROUTE_PATH } from "@/lib/routes"
import { flowProblems, shortHash } from "./presenters"

type FlowTag = { readonly id: string; readonly label: string; readonly tone: Tone }

function ProjectSummary({ project }: { readonly project: ApiProject }) {
  const t = useTranslations("project.summary")
  const rows: readonly PropertyRow[] = [
    { key: t("root"), value: project.root },
    { key: t("package"), value: project.package ?? t("none") },
    { key: t("engine"), value: project.engine_version },
    { key: t("treeHash"), value: shortHash(project.tree_hash) },
    { key: t("projectFile"), value: project.project_file?.path ?? t("none") },
    { key: t("lockFile"), value: project.lock_file?.path ?? t("noLockFile") },
    { key: t("mcp"), value: project.mcp_url ?? t("none") },
    { key: t("specSeq"), value: String(project.spec_seq) },
  ]
  return (
    <TitledPanel size="section" title={t("title")}>
      <PropertyList rows={rows} />
    </TitledPanel>
  )
}

const problemsRow = (project: ApiProject, t: Translator<"project.index">): PropertyRow => {
  const { error, warning, info } = project.problems
  if (error + warning + info === 0) return { key: t("problems"), value: t("clean"), tone: "success" }
  return {
    key: t("problems"),
    value: t("counts", { errors: error, warnings: warning, infos: info }),
    tone: error > 0 ? "destructive" : "warning",
  }
}

const quarantinedRow = (project: ApiProject, t: Translator<"project.index">): PropertyRow => {
  if (project.quarantined_files.length === 0) return { key: t("quarantined"), value: t("none"), tone: "neutral" }
  return { key: t("quarantined"), value: project.quarantined_files.join(", "), tone: "warning" }
}

function IndexPanel({ project }: { readonly project: ApiProject }) {
  const t = useTranslations("project.index")
  const vocabulary = useTranslations("domain")
  const ago = useRelativeTime("long")
  const { index } = project
  const rows: readonly PropertyRow[] = [
    { key: t("status"), value: vocabulary(`indexStatus.${index.status}`), tone: INDEX_STATUS_TONE[index.status] },
    { key: t("generation"), value: String(index.generation) },
    { key: t("indexedAt"), value: ago(isoDateTime(index.indexed_at)) },
    { key: t("pending"), value: String(index.pending_files) },
    problemsRow(project, t),
    quarantinedRow(project, t),
  ]
  return (
    <TitledPanel size="section" title={t("title")}>
      <PropertyList rows={rows} />
    </TitledPanel>
  )
}

const flowTags = (flow: ApiFlow, t: Translator<"project.flows">, vocabulary: Translator<"domain">): readonly FlowTag[] => {
  const problems = flowProblems(flow)
  const tags: readonly FlowTag[] = [
    { id: "nodes", label: t("nodes", { count: flow.node_count }), tone: "neutral" },
    { id: "status", label: vocabulary(`compileStatus.${flow.compile_status}`), tone: COMPILE_STATUS_TONE[flow.compile_status] },
  ]
  if (problems === null) return tags
  return [...tags, { id: "problems", label: t(`problems.${problems.severity}`, { count: problems.count }), tone: problems.tone }]
}

function FlowRow({ flow }: { readonly flow: ApiFlow }) {
  const t = useTranslations("project.flows")
  const vocabulary = useTranslations("domain")
  return (
    <Surface variant="panel" padding="sm" interactive asChild>
      <Link to={ROUTE_PATH.canvas} params={{ flowId: toFlowId(flow.flow_id) }}>
        <Heading
          size="block"
          title={flow.flow_id}
          below={[t("io", { input: flow.input_type ?? t("unknownType"), output: flow.output_type ?? t("unknownType") }), flow.root_path]}
          trailing={
            <div className="flex items-center gap-1.5">
              {flowTags(flow, t, vocabulary).map((tag) => (
                <Tag key={tag.id} size="xs" tone={tag.tone}>
                  {tag.label}
                </Tag>
              ))}
            </div>
          }
        />
      </Link>
    </Surface>
  )
}

function FlowList({ flows }: { readonly flows: readonly ApiFlow[] }) {
  const t = useTranslations("project.flows")
  if (flows.length === 0) return <Empty title={t("empty")} hint={t("emptyHint")} />
  return (
    <nav aria-label={t("navAria")} className="flex flex-col gap-1.5">
      {flows.map((flow) => (
        <FlowRow key={flow.flow_id} flow={flow} />
      ))}
    </nav>
  )
}

export function ProjectScreen(): JSX.Element {
  const { project, flows } = projectRouteApi.useLoaderData()
  const t = useTranslations("project")
  return (
    <Page width="md">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4">
        <Heading size="page" title={t("title", { package: project.package ?? project.root })} below={[t("lead")]} />
        <ProjectSummary project={project} />
        <IndexPanel project={project} />
        <section className="flex flex-col gap-1.5">
          <Heading size="block" title={t("flows.title")} />
          <FlowList flows={flows} />
        </section>
      </div>
    </Page>
  )
}
