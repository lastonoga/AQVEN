import type { JSX, ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { useTranslations } from "use-intl"
import type { Locale, SettingsSection, SetupOverview } from "@/domain"
import { SETTINGS_SECTIONS } from "@/domain"
import { Actions, Heading, Page, PropertyList, Surface, Text, TitledPanel } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { useRelativeTime } from "@/i18n/format"
import { ROUTE_PATH, settingsRouteApi } from "@/lib/routes"
import { AgentCard } from "./agent-card"
import { AgentProfilePanel } from "./agent-profile"
import { CommandLine } from "./command-line"
import { DefaultAgent } from "./default-agent"
import { chosenAgent, mcpCommands, UPGRADE_COMMANDS, updateAvailable } from "./presenters"
import { ProjectProperties, ServerProperties } from "./project-summary"
import { ProviderKeys } from "./provider-keys"
import { SettingRows } from "./setting-row"

const NAV_WIDTH = 220
const PYPI_RELEASES = "https://pypi.org/project/aqven/#history"

type SectionProps = { readonly overview: SetupOverview }

function CommandBlock({ title, hint, command }: { readonly title: string; readonly hint: string; readonly command: string }) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <Heading size="block" title={title} below={[hint]} />
      <CommandLine command={command} />
    </div>
  )
}

function ProjectSection({ overview }: SectionProps) {
  const t = useTranslations("setup.project")
  return (
    <>
      <TitledPanel size="section" title={t("title")} below={[t("description")]}>
        <ProjectProperties project={overview.project} />
        <div className="border-t border-border">
          <ServerProperties server={overview.server} />
        </div>
      </TitledPanel>
      <TitledPanel size="section" title={t("anotherProject")}>
        <div className="p-3">
          <CommandLine command={overview.server.command} />
        </div>
      </TitledPanel>
    </>
  )
}

function AgentsSection({ overview }: SectionProps) {
  const t = useTranslations("setup")
  const selected = chosenAgent(overview.defaultAgent, overview.agents)
  const several = overview.agents.length > 1
  return (
    <>
      <Heading
        size="section"
        title={t("settings.sections.agents")}
        below={[t("agent.description")]}
        trailing={<Actions actions={[{ id: "save", label: t("settings.agents.save"), variant: "default" }]} />}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-3">
        {overview.agents.map(({ probe }) => (
          <AgentCard key={probe.kind} probe={probe} selected={several && probe.kind === selected} />
        ))}
      </div>
      {several ? (
        <TitledPanel size="section" title={t("settings.agents.general")}>
          <DefaultAgent agents={overview.agents} preferred={overview.defaultAgent} />
        </TitledPanel>
      ) : null}
      {overview.agents.map(({ profile }) => (
        <AgentProfilePanel key={profile.kind} profile={profile} />
      ))}
    </>
  )
}

function ProvidersSection({ overview }: SectionProps) {
  const t = useTranslations("setup.providers")
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]}>
      <ProviderKeys providers={overview.providers} />
    </TitledPanel>
  )
}

function McpSection({ overview }: SectionProps) {
  const t = useTranslations("setup.settings.mcp")
  const commands = mcpCommands(overview.project.root)
  return (
    <>
      <TitledPanel size="section" title={t("server")} below={[t("serverDescription")]}>
        <PropertyList
          rows={[
            { key: t("address"), value: overview.server.mcpUrl },
            { key: t("auth"), value: t("authValue") },
          ]}
        />
      </TitledPanel>
      <TitledPanel size="section" title={t("connect")}>
        <SettingRows>
          <CommandBlock title={t("claudeCode")} hint={t("claudeCodeHint")} command={commands.claudeCode} />
          <CommandBlock title={t("cursor")} hint={t("cursorHint")} command={commands.cursor} />
          <CommandBlock title={t("claudeDesktop")} hint={t("claudeDesktopHint")} command={commands.claudeDesktop} />
        </SettingRows>
      </TitledPanel>
    </>
  )
}

function UpdatesSection({ overview }: SectionProps) {
  const t = useTranslations("setup.settings.updates")
  const ago = useRelativeTime("long")
  const { release } = overview
  const available = updateAvailable(release)
  const notes = (
    <Button variant="ghost" size="sm" asChild>
      <a href={PYPI_RELEASES} target="_blank" rel="noreferrer">
        {t("releases")}
        <ExternalLink />
      </a>
    </Button>
  )
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]} trailing={notes}>
      <PropertyList
        rows={[
          { key: t("installed"), value: release.installed },
          available ? { key: t("latest"), value: t("available", { version: release.latest }), tone: "success" } : { key: t("latest"), value: t("upToDate") },
          { key: t("checked"), value: ago(release.checkedAt) },
        ]}
      />
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
    <nav aria-label={t("navAria")} className="flex flex-col gap-1">
      {SETTINGS_SECTIONS.map((item) => (
        <Surface key={item} variant="panel" padding="sm" interactive selected={item === section} asChild>
          <Link from={ROUTE_PATH.settings} to="." search={{ section: item }} resetScroll={false}>
            <Text role="meta" weight="medium">
              {t(`sections.${item}`)}
            </Text>
          </Link>
        </Surface>
      ))}
    </nav>
  )
}

function SettingsHeader({ locale, project }: { readonly locale: Locale; readonly project: string }) {
  const t = useTranslations("setup.settings")
  return (
    <Heading
      size="page"
      title={t("title")}
      below={[`${project} · ${t("lead")}`]}
      trailing={
        <Button variant="outline" size="sm" asChild>
          <Link to="/$locale" params={{ locale }}>
            <ArrowLeft />
            {t("back")}
          </Link>
        </Button>
      }
    />
  )
}

export function SettingsScreen(): JSX.Element {
  const { overview, section } = settingsRouteApi.useLoaderData()
  const { locale } = settingsRouteApi.useParams()
  const Body = SECTION_BODY[section]
  return (
    <Page
      width="md"
      header={<SettingsHeader locale={locale} project={overview.project.name} />}
      aside={{ content: <SettingsNav section={section} />, width: NAV_WIDTH }}
    >
      <div className="flex flex-col gap-4">
        <Body overview={overview} />
      </div>
    </Page>
  )
}
