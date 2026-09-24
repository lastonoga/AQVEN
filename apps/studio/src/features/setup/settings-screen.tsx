import { useState, type JSX } from "react"
import { useTranslations } from "use-intl"
import type { ApiProject } from "@/domain"
import { Expander, Heading, Page, PropertyList, Text, TitledPanel } from "@/components/studio"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { settingsRouteApi } from "@/lib/routes"
import { ChatStatusPanel } from "./chat-status"
import { CommandLine } from "./command-line"
import { KeysBoundary, ModelKeysPanel, OtherSecretsPanel } from "./model-keys"
import { mcpCommands, UPGRADE_COMMAND } from "./presenters"
import { useProjectKeys } from "./project-keys"

const OTHER_CLIENTS_ID = "settings-other-mcp-clients"

function KeysSection() {
  const keys = useProjectKeys()
  return (
    <KeysBoundary state={keys}>
      {(loaded) => (
        <>
          <ModelKeysPanel keys={loaded} onChanged={keys.reload} />
          <OtherSecretsPanel keys={loaded} onChanged={keys.reload} />
        </>
      )}
    </KeysBoundary>
  )
}

function OtherClients({ stdio }: { readonly stdio: string }) {
  const t = useTranslations("setup.settings.agent")
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col items-start gap-2">
      <CollapsibleTrigger asChild>
        <Expander open={open} label={t("otherClients")} controls={OTHER_CLIENTS_ID} />
      </CollapsibleTrigger>
      <CollapsibleContent id={OTHER_CLIENTS_ID} className="flex w-full flex-col gap-2">
        <Text as="p" role="hint" tone="neutral">
          {t("otherClientsHint")}
        </Text>
        <CommandLine command={stdio} />
      </CollapsibleContent>
    </Collapsible>
  )
}

function CodingAgentSection({ root }: { readonly root: string }) {
  const t = useTranslations("setup.settings.agent")
  const commands = mcpCommands(root)
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]}>
      <div className="flex flex-col gap-3 p-3">
        <Heading size="block" title={t("claudeCode")} below={[t("claudeCodeHint")]} />
        <CommandLine command={commands.claudeCode} />
        <OtherClients stdio={commands.stdio} />
      </div>
    </TitledPanel>
  )
}

function ChatSection() {
  const t = useTranslations("setup.settings.chat")
  return <ChatStatusPanel selectable title={t("title")} description={t("description")} />
}

function AboutSection({ project }: { readonly project: ApiProject }) {
  const t = useTranslations("setup.settings.about")
  return (
    <TitledPanel size="section" title={t("title")}>
      <PropertyList
        rows={[
          { key: t("folder"), value: project.root },
          { key: t("version"), value: project.engine_version },
        ]}
      />
      <div className="flex flex-col gap-2 border-t border-border p-3">
        <Heading size="block" title={t("update")} below={[t("updateHint")]} />
        <CommandLine command={UPGRADE_COMMAND} />
      </div>
    </TitledPanel>
  )
}

function SettingsHeader({ project }: { readonly project: ApiProject }) {
  const t = useTranslations("setup.settings")
  return <Heading size="page" title={t("title")} below={[t("lead", { project: project.package ?? project.root, version: project.engine_version })]} />
}

export function SettingsScreen(): JSX.Element {
  const { project } = settingsRouteApi.useLoaderData()
  return (
    <Page width="md" header={<SettingsHeader project={project} />}>
      <div className="flex flex-col gap-6">
        <KeysSection />
        <CodingAgentSection root={project.root} />
        <ChatSection />
        <AboutSection project={project} />
      </div>
    </Page>
  )
}
