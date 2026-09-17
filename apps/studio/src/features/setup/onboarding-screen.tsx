import type { JSX, ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { Locale, SetupOverview, SetupStep, WorkflowTemplate } from "@/domain"
import { SETUP_STEPS } from "@/domain"
import { ChoiceLink, ChoiceList, Heading, Page, Text, TitledPanel, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { ROUTE_PATH, setupRouteApi } from "@/lib/routes"
import { landingOf } from "@/lib/setup"
import { AgentCard } from "./agent-card"
import { DefaultAgent } from "./default-agent"
import { chosenAgent, hasProviderKey, neighboursOf } from "./presenters"
import { ProviderKeys } from "./provider-keys"
import { WorkflowStart } from "./workflow-start"

type StepProps = {
  readonly locale: Locale
  readonly overview: SetupOverview
  readonly templates: readonly WorkflowTemplate[]
}

function AgentStep({ overview }: StepProps) {
  const t = useTranslations("setup.agent")
  const selected = chosenAgent(overview.defaultAgent, overview.agents)
  return (
    <>
      <Heading size="section" title={t("title")} below={[t("description")]} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] items-start gap-3">
        {overview.agents.map(({ probe }) => (
          <AgentCard key={probe.kind} probe={probe} selected={overview.agents.length > 1 && probe.kind === selected} />
        ))}
      </div>
      <Text role="hint" tone="neutral">
        {t("signInNote")}
      </Text>
      <DefaultAgent agents={overview.agents} preferred={overview.defaultAgent} />
    </>
  )
}

function ProvidersStep({ overview }: StepProps) {
  const t = useTranslations("setup.providers")
  return (
    <>
      <TitledPanel size="section" title={t("title")} below={[t("description")]}>
        <ProviderKeys providers={overview.providers} />
      </TitledPanel>
      {hasProviderKey(overview.providers) ? null : (
        <Text role="hint" tone="warning">
          {t("missingNote")}
        </Text>
      )}
    </>
  )
}

function WorkflowStep({ locale, overview, templates }: StepProps) {
  return (
    <WorkflowStart
      locale={locale}
      project={overview.project}
      templates={templates}
      agent={chosenAgent(overview.defaultAgent, overview.agents)}
    />
  )
}

const STEP_BODY: Readonly<Record<SetupStep, (props: StepProps) => ReactNode>> = {
  agent: AgentStep,
  providers: ProvidersStep,
  workflow: WorkflowStep,
}

function SkipLink({ locale, overview }: { readonly locale: Locale; readonly overview: SetupOverview }) {
  const t = useTranslations("setup.onboarding")
  const landing = landingOf(overview)
  if (landing.kind === "setup") return null
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to={ROUTE_PATH.schema} params={{ locale, workspaceId: landing.workspaceId, workflowId: landing.workflowId }}>
        {t("skip")}
      </Link>
    </Button>
  )
}

function StepNav({ step }: { readonly step: SetupStep }) {
  const t = useTranslations("setup.onboarding")
  return (
    <div className="flex">
      <ChoiceList appearance="segmented" label={t("stepsAria")}>
        {SETUP_STEPS.map((item) => (
          <ChoiceLink key={item} appearance="segmented" from={ROUTE_PATH.setup} to="." search={{ step: item }} selected={item === step}>
            {t(`steps.${item}`)}
          </ChoiceLink>
        ))}
      </ChoiceList>
    </div>
  )
}

function StepFooter({ step }: { readonly step: SetupStep }) {
  const t = useTranslations("setup.onboarding")
  const { previous, next } = neighboursOf(step)
  const back =
    previous === undefined ? null : (
      <Button variant="outline" asChild>
        <Link from={ROUTE_PATH.setup} to="." search={{ step: previous }}>
          <ArrowLeft />
          {t("back")}
        </Link>
      </Button>
    )
  const forward =
    next === undefined ? null : (
      <Button asChild>
        <Link from={ROUTE_PATH.setup} to="." search={{ step: next }}>
          {t("continue")}
          <ArrowRight />
        </Link>
      </Button>
    )
  return (
    <Toolbar end={forward} className="justify-between">
      {back}
    </Toolbar>
  )
}

function BrandLine({ locale, overview }: { readonly locale: Locale; readonly overview: SetupOverview }) {
  const t = useTranslations("setup.onboarding")
  return (
    <Toolbar end={<SkipLink locale={locale} overview={overview} />} className="justify-between">
      <Text role="item" weight="semibold">
        {t("brand")}
      </Text>
    </Toolbar>
  )
}

export function OnboardingScreen(): JSX.Element {
  const { overview, templates, step } = setupRouteApi.useLoaderData()
  const { locale } = setupRouteApi.useParams()
  const t = useTranslations("setup.onboarding")
  const Body = STEP_BODY[step]
  const { project, server } = overview
  return (
    <Page width="md">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4">
        <BrandLine locale={locale} overview={overview} />
        <Heading
          size="page"
          title={t("title", { project: project.name })}
          below={[`${project.root} · ${server.url}`, t("lead")]}
        />
        <StepNav step={step} />
        <Body locale={locale} overview={overview} templates={templates} />
        <StepFooter step={step} />
      </div>
    </Page>
  )
}
