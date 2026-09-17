import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { Sparkles } from "lucide-react"
import { useTranslations } from "use-intl"
import type { AgentKind, Locale, ProjectInfo, WorkflowTemplate } from "@/domain"
import { ChoiceGroup, Heading, Surface, Tag, TitledPanel, type ChoiceItem } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { noop } from "@/lib/noop"
import { ROUTE_PATH } from "@/lib/routes"

const SUGGESTIONS = ["reviews", "tickets", "products"] as const
type Suggestion = (typeof SUGGESTIONS)[number]

function ProjectWorkflows({ locale, project }: { readonly locale: Locale; readonly project: ProjectInfo }) {
  const t = useTranslations("setup.workflow")
  return (
    <TitledPanel size="section" title={t("existingTitle", { project: project.name })} below={[t("existingDescription")]}>
      <nav aria-label={t("existingTitle", { project: project.name })} className="flex flex-col gap-1.5 p-1.5">
        {project.workflows.map((workflow) => (
          <Surface key={workflow.id} variant="panel" padding="sm" interactive asChild>
            <Link to={ROUTE_PATH.schema} params={{ locale, workspaceId: project.workspaceId, workflowId: workflow.id }}>
              <Heading size="block" title={workflow.id} trailing={<Tag size="xs">{t("nodes", { count: workflow.nodeCount })}</Tag>} />
            </Link>
          </Surface>
        ))}
      </nav>
    </TitledPanel>
  )
}

function DescribeOption({ agentName }: { readonly agentName: string }) {
  const t = useTranslations("setup.workflow")
  const [prompt, setPrompt] = useState("")
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const items: readonly ChoiceItem<Suggestion>[] = SUGGESTIONS.map((value) => ({ value, label: t(`suggestions.${value}`) }))
  const pick = (value: Suggestion | null): void => {
    setSuggestion(value)
    if (value !== null) setPrompt(t(`suggestions.${value}`))
  }
  return (
    <Surface variant="panel" padding="md" className="flex flex-col gap-2.5">
      <Heading size="block" title={t("describe.title")} below={[t("describe.description", { agent: agentName })]} />
      <Textarea
        value={prompt}
        placeholder={t("describe.placeholder")}
        onChange={(event) => {
          setPrompt(event.target.value)
        }}
      />
      <ChoiceGroup
        appearance="chip"
        size="sm"
        deselectable
        label={t("describe.suggestionsAria")}
        items={items}
        value={suggestion}
        onValueChange={pick}
      />
      <div>
        <Button disabled={prompt.trim().length === 0} onClick={noop}>
          <Sparkles />
          {t("describe.action", { agent: agentName })}
        </Button>
      </div>
    </Surface>
  )
}

function TemplateOption({ templates }: { readonly templates: readonly WorkflowTemplate[] }) {
  const t = useTranslations("setup.workflow")
  return (
    <Surface variant="panel" padding="md" className="flex flex-col gap-2.5">
      <Heading size="block" title={t("template.title")} below={[t("template.description")]} />
      <div className="flex flex-col gap-1.5">
        {templates.map((template) => (
          <Surface key={template.id} variant="well" padding="sm">
            <Heading
              size="block"
              title={template.title}
              tags={[{ children: t("nodes", { count: template.nodeCount }), size: "xs" }]}
              below={[template.summary]}
              trailing={
                <Button variant="outline" size="xs" onClick={noop}>
                  {t("template.use")}
                </Button>
              }
            />
          </Surface>
        ))}
      </div>
    </Surface>
  )
}

function BlankOption() {
  const t = useTranslations("setup.workflow.blank")
  const [name, setName] = useState("")
  return (
    <Surface variant="panel" padding="md" className="flex flex-col gap-2.5">
      <Heading size="block" title={t("title")} below={[t("description")]} />
      <div className="flex gap-2">
        <Input
          value={name}
          placeholder={t("placeholder")}
          aria-label={t("title")}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <Button variant="outline" disabled={name.trim().length === 0} onClick={noop}>
          {t("action")}
        </Button>
      </div>
    </Surface>
  )
}

export type WorkflowStartProps = {
  readonly locale: Locale
  readonly project: ProjectInfo
  readonly templates: readonly WorkflowTemplate[]
  readonly agent: AgentKind | null
}

export function WorkflowStart({ locale, project, templates, agent }: WorkflowStartProps) {
  const t = useTranslations("setup.workflow")
  const name = useTranslations("setup.agent.names")
  if (project.workflows.length > 0) return <ProjectWorkflows locale={locale} project={project} />
  return (
    <section className="flex flex-col gap-3">
      <Heading size="section" title={t("emptyTitle")} below={[t("emptyDescription", { project: project.name })]} />
      <DescribeOption agentName={name(agent ?? "claude")} />
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-3">
        <TemplateOption templates={templates} />
        <BlankOption />
      </div>
    </section>
  )
}
