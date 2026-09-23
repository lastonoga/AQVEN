import { useEffect, useState, type JSX, type ReactNode } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject, ApiProviderKey, ApiSecret, SettingsSection } from "@/domain"
import { SETTINGS_SECTIONS } from "@/domain"
import {
  COMPILE_STATUS_TONE,
  Empty,
  Heading,
  INDEX_STATUS_TONE,
  Page,
  PropertyList,
  Surface,
  Tag,
  Text,
  TitledPanel,
  type PropertyRow,
  type Tone,
} from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { flowId as toFlowId, isoDateTime } from "@/data/ids"
import { useRelativeTime } from "@/i18n/format"
import type { Translator } from "@/i18n/translator"
import { ROUTE_PATH, settingsRouteApi } from "@/lib/routes"
import { ChatStatusPanel } from "./chat-status"
import { CommandLine } from "./command-line"
import { ANOTHER_PROJECT_COMMAND, flowProblems, mcpCommands, shortHash, UPGRADE_COMMANDS } from "./presenters"
import { ProjectSecrets } from "./project-secrets"
import { ProviderKeys } from "./provider-keys"
import { SettingRows } from "./setting-row"

const NAV_WIDTH = 220
const NAV_ITEM_CLASS = "flex min-h-10 w-full items-center border-l-2 border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 selected:border-l-foreground selected:bg-background selected:font-medium selected:text-foreground"

type SectionProps = {
  readonly project: ApiProject
  readonly flows: readonly ApiFlow[]
  readonly providers: readonly ApiProviderKey[]
  readonly secrets: readonly ApiSecret[]
}

function CommandBlock({ title, hint, command }: { readonly title: string; readonly hint: string; readonly command: string }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <Heading size="block" title={title} below={[hint]} />
      <CommandLine command={command} />
    </div>
  )
}

type FlowTag = { readonly id: string; readonly label: string; readonly tone: Tone }

const indexProblemsRow = (project: ApiProject, t: Translator<"project.index">): PropertyRow => {
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
    <nav aria-label={t("navAria")} className="flex flex-col gap-1.5 p-3">
      {flows.map((flow) => (
        <FlowRow key={flow.flow_id} flow={flow} />
      ))}
    </nav>
  )
}

function ProjectSection({ project, flows }: SectionProps) {
  const t = useTranslations("setup.settings.project")
  const summaryT = useTranslations("project.summary")
  const indexT = useTranslations("project.index")
  const flowsT = useTranslations("project.flows")
  const vocabulary = useTranslations("domain")
  const ago = useRelativeTime("long")
  const { index } = project
  const summaryRows: readonly PropertyRow[] = [
    { key: summaryT("root"), value: project.root },
    { key: summaryT("package"), value: project.package ?? summaryT("none") },
    { key: summaryT("engine"), value: project.engine_version },
    { key: summaryT("treeHash"), value: shortHash(project.tree_hash) },
    { key: summaryT("projectFile"), value: project.project_file?.path ?? summaryT("none") },
    { key: summaryT("lockFile"), value: project.lock_file?.path ?? summaryT("noLockFile") },
    { key: summaryT("mcp"), value: project.mcp_url ?? summaryT("none") },
    { key: summaryT("specSeq"), value: String(project.spec_seq) },
  ]
  const indexRows: readonly PropertyRow[] = [
    { key: indexT("status"), value: vocabulary(`indexStatus.${index.status}`), tone: INDEX_STATUS_TONE[index.status] },
    { key: indexT("generation"), value: String(index.generation) },
    { key: indexT("indexedAt"), value: ago(isoDateTime(index.indexed_at)) },
    { key: indexT("pending"), value: String(index.pending_files) },
    indexProblemsRow(project, indexT),
    quarantinedRow(project, indexT),
  ]
  return (
    <>
      <TitledPanel size="section" title={t("title")} below={[t("description")]}>
        <PropertyList rows={summaryRows} />
      </TitledPanel>
      <TitledPanel size="section" title={indexT("title")}>
        <PropertyList rows={indexRows} />
      </TitledPanel>
      <TitledPanel size="section" title={flowsT("title")}>
        <FlowList flows={flows} />
      </TitledPanel>
      <TitledPanel size="section" title={t("anotherProject")}>
        <div className="p-3">
          <CommandLine command={ANOTHER_PROJECT_COMMAND} />
        </div>
      </TitledPanel>
    </>
  )
}

function AgentsSection() {
  const t = useTranslations("setup.settings.sections")
  return <ChatStatusPanel selectable title={t("agents")} />
}

function ProvidersSection({ providers, secrets }: SectionProps) {
  const t = useTranslations("setup.providers")
  const secretsCopy = useTranslations("setup.secrets")
  return (
    <>
      <TitledPanel size="section" title={t("title")} below={[t("description")]}>
        <ProviderKeys providers={providers} />
      </TitledPanel>
      <TitledPanel size="section" title={secretsCopy("title")} below={[secretsCopy("description")]}>
        <ProjectSecrets secrets={secrets} />
      </TitledPanel>
    </>
  )
}

function McpSection({ project }: SectionProps) {
  const t = useTranslations("setup.settings.mcp")
  const commands = mcpCommands(project.root)
  return (
    <>
      <TitledPanel size="section" title={t("server")} below={[t("serverDescription")]}>
        <PropertyList
          rows={[
            { key: t("address"), value: project.mcp_url ?? t("none") },
            { key: t("auth"), value: t("authValue") },
          ]}
        />
      </TitledPanel>
      <TitledPanel size="section" title={t("connect")}>
        <SettingRows>
          <CommandBlock title={t("claudeCode")} hint={t("claudeCodeHint")} command={commands.claudeCode} />
          <CommandBlock title={t("stdio")} hint={t("stdioHint")} command={commands.stdio} />
        </SettingRows>
      </TitledPanel>
    </>
  )
}

function UpdatesSection({ project }: SectionProps) {
  const t = useTranslations("setup.settings.updates")
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]}>
      <PropertyList rows={[{ key: t("installed"), value: project.engine_version }]} />
      <div className="border-t border-border">
        <SettingRows>
          <CommandBlock title={t("uv")} hint={t("uvHint")} command={UPGRADE_COMMANDS.uv} />
          <CommandBlock title={t("pip")} hint={t("pipHint")} command={UPGRADE_COMMANDS.pip} />
        </SettingRows>
      </div>
    </TitledPanel>
  )
}

const SECTION_BODY: Readonly<Record<SettingsSection, (props: SectionProps) => ReactNode>> = {
  project: ProjectSection,
  agents: AgentsSection,
  providers: ProvidersSection,
  mcp: McpSection,
  updates: UpdatesSection,
}

function SettingsNav({ section }: { readonly section: SettingsSection }) {
  const t = useTranslations("setup.settings")
  return (
    <nav aria-label={t("navAria")} className="flex flex-col">
      {SETTINGS_SECTIONS.map((item) => (
        <Link key={item} from={ROUTE_PATH.settings} to="." search={{ section: item }} resetScroll={false} aria-current={item === section ? "page" : undefined} className={NAV_ITEM_CLASS}>
          <Text role="meta">{t(`sections.${item}`)}</Text>
        </Link>
      ))}
    </nav>
  )
}

function SettingsBody({ section, ...props }: SectionProps & { readonly section: SettingsSection }) {
  const Body = SECTION_BODY[section]
  return (
    <div className="flex flex-col gap-4">
      <Body {...props} />
    </div>
  )
}

const EMPTY_PROVIDERS: readonly ApiProviderKey[] = []
const EMPTY_SECRETS: readonly ApiSecret[] = []

function SettingsContent({
  project,
  flows,
  section,
}: {
  readonly project: ApiProject
  readonly flows: readonly ApiFlow[]
  readonly section: SettingsSection
}) {
  const t = useTranslations("setup.settings")
  const { api } = useRouter().options.context
  const [providers, setProviders] = useState<readonly ApiProviderKey[] | null>(null)
  const [secrets, setSecrets] = useState<readonly ApiSecret[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (section !== "providers" || (providers !== null && secrets !== null)) return
    let live = true
    void Promise.all([api.settings.providers(), api.settings.secrets()]).then(([nextProviders, nextSecrets]) => {
      if (live) {
        setProviders(nextProviders)
        setSecrets(nextSecrets)
        setError(null)
      }
    }).catch((reason: unknown) => {
      if (live) setError(String(reason))
    })
    return () => { live = false }
  }, [api, providers, revision, secrets, section])

  if (section === "providers" && (providers === null || secrets === null)) {
    if (error !== null) return (
      <Alert variant="destructive">
        <AlertDescription>{t("loadError")} {error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => { setError(null); setRevision((current) => current + 1) }}>{t("retry")}</Button>
      </Alert>
    )
    return (
      <div role="status" aria-label={t("loading")} className="flex flex-col gap-3">
        <Skeleton aria-hidden className="h-5 w-1/3" />
        <Skeleton aria-hidden className="h-20" />
        <Skeleton aria-hidden className="h-20" />
      </div>
    )
  }
  return (
    <SettingsBody
      project={project}
      flows={flows}
      section={section}
      providers={providers ?? EMPTY_PROVIDERS}
      secrets={secrets ?? EMPTY_SECRETS}
    />
  )
}

function SettingsHeader({ project }: { readonly project: string }) {
  const t = useTranslations("setup.settings")
  return <Heading size="page" title={t("title")} below={[`${project} · ${t("lead")}`]} />
}

export function SettingsScreen(): JSX.Element {
  const { project, flows, section } = settingsRouteApi.useLoaderData()
  return (
    <Page
      width="md"
      header={<SettingsHeader project={project.package ?? project.root} />}
      aside={{ content: <SettingsNav section={section} />, width: NAV_WIDTH }}
    >
      <SettingsContent project={project} flows={flows} section={section} />
    </Page>
  )
}
