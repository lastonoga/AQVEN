import { useEffect, useState, type JSX, type ReactNode } from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiProject, ApiProviderKey, ApiSecret, SettingsSection } from "@/domain"
import { SETTINGS_SECTIONS } from "@/domain"
import { Heading, INDEX_STATUS_TONE, Page, PropertyList, Text, TitledPanel, type PropertyRow } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import type { Translator } from "@/i18n/translator"
import { ROUTE_PATH, settingsRouteApi } from "@/lib/routes"
import { ChatStatusPanel } from "./chat-status"
import { CommandLine } from "./command-line"
import { ANOTHER_PROJECT_COMMAND, mcpCommands, UPGRADE_COMMANDS } from "./presenters"
import { ProjectSecrets } from "./project-secrets"
import { ProviderKeys } from "./provider-keys"
import { SettingRows } from "./setting-row"

const NAV_WIDTH = 220
const NAV_ITEM_CLASS = "flex min-h-10 w-full items-center border-l-2 border-transparent px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 selected:border-l-foreground selected:bg-background selected:font-medium selected:text-foreground"

type SectionProps = {
  readonly project: ApiProject
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

const problemsRow = (project: ApiProject, t: Translator<"setup.settings.project">): PropertyRow => {
  const { error, warning, info } = project.problems
  if (error + warning + info === 0) return { key: t("problems"), value: t("clean"), tone: "success" }
  return {
    key: t("problems"),
    value: t("counts", { errors: error, warnings: warning, infos: info }),
    tone: error > 0 ? "destructive" : "warning",
  }
}

function ProjectSection({ project }: SectionProps) {
  const t = useTranslations("setup.settings.project")
  const vocabulary = useTranslations("domain")
  const open = (
    <Button variant="outline" size="sm" asChild>
      <Link to={ROUTE_PATH.project}>
        {t("open")}
        <ArrowRight />
      </Link>
    </Button>
  )
  const rows: readonly PropertyRow[] = [
    { key: t("folder"), value: project.root },
    { key: t("package"), value: project.package ?? t("none") },
    { key: t("engine"), value: project.engine_version },
    { key: t("projectFile"), value: project.project_file?.path ?? t("none") },
    { key: t("lockFile"), value: project.lock_file?.path ?? t("none") },
    { key: t("index"), value: vocabulary(`indexStatus.${project.index.status}`), tone: INDEX_STATUS_TONE[project.index.status] },
    problemsRow(project, t),
  ]
  return (
    <>
      <TitledPanel size="section" title={t("title")} below={[t("description")]} trailing={open}>
        <PropertyList rows={rows} />
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
  return <ChatStatusPanel selectable />
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

export function SettingsNav({ section, onSectionChange }: { readonly section: SettingsSection; readonly onSectionChange?: (section: SettingsSection) => void }) {
  const t = useTranslations("setup.settings")
  return (
    <nav aria-label={t("navAria")} className="flex flex-col">
      {SETTINGS_SECTIONS.map((item) => {
        const label = <Text role="meta">{t(`sections.${item}`)}</Text>
        return (
          onSectionChange === undefined ? (
            <Link key={item} from={ROUTE_PATH.settings} to="." search={{ section: item }} resetScroll={false} aria-current={item === section ? "page" : undefined} className={NAV_ITEM_CLASS}>
              {label}
            </Link>
          ) : (
            <button key={item} type="button" aria-current={item === section ? "true" : undefined} className={NAV_ITEM_CLASS} onClick={() => { onSectionChange(item) }}>
              {label}
            </button>
          )
        )
      })}
    </nav>
  )
}

export function SettingsBody({ section, ...props }: SectionProps & { readonly section: SettingsSection }) {
  const Body = SECTION_BODY[section]
  return (
    <div className="flex flex-col gap-4">
      <Body {...props} />
    </div>
  )
}

const EMPTY_PROVIDERS: readonly ApiProviderKey[] = []
const EMPTY_SECRETS: readonly ApiSecret[] = []

export function SettingsContent({ project, section }: { readonly project: ApiProject; readonly section: SettingsSection }) {
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
  return <SettingsBody project={project} section={section} providers={providers ?? EMPTY_PROVIDERS} secrets={secrets ?? EMPTY_SECRETS} />
}

function SettingsHeader({ project }: { readonly project: string }) {
  const t = useTranslations("setup.settings")
  return (
    <Heading
      size="page"
      title={t("title")}
      below={[`${project} · ${t("lead")}`]}
      trailing={
        <Button variant="outline" size="sm" asChild>
          <Link to="/">
            <ArrowLeft />
            {t("back")}
          </Link>
        </Button>
      }
    />
  )
}

export function SettingsScreen(): JSX.Element {
  const { project, section } = settingsRouteApi.useLoaderData()
  return (
    <Page
      width="md"
      header={<SettingsHeader project={project.package ?? project.root} />}
      aside={{ content: <SettingsNav section={section} />, width: NAV_WIDTH }}
    >
      <SettingsContent project={project} section={section} />
    </Page>
  )
}
