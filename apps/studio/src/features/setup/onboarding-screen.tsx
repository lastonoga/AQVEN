import type { JSX, ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiFlow, SetupStep } from "@/domain"
import { SETUP_STEPS } from "@/domain"
import { ChoiceLink, ChoiceList, Empty, Heading, Page, Surface, Tag, Text, TitledPanel, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { flowId as toFlowId } from "@/data/ids"
import { landingFlow } from "@/lib/landing"
import { ROUTE_PATH, setupRouteApi } from "@/lib/routes"
import { ChatStatusPanel } from "./chat-status"
import { KeysBoundary, ModelKeysPanel } from "./model-keys"
import { neighboursOf } from "./presenters"
import { useProjectKeys } from "./project-keys"

type StepProps = {
  readonly flows: readonly ApiFlow[]
}

function AgentStep() {
  return <ChatStatusPanel />
}

function ProvidersStep() {
  const keys = useProjectKeys()
  return <KeysBoundary state={keys}>{(loaded) => <ModelKeysPanel keys={loaded} onChanged={keys.reload} />}</KeysBoundary>
}

function FlowLink({ flow }: { readonly flow: ApiFlow }) {
  const t = useTranslations("setup.workflow")
  return (
    <Surface variant="panel" padding="sm" interactive asChild>
      <Link to={ROUTE_PATH.canvas} params={{ flowId: toFlowId(flow.flow_id) }}>
        <Heading size="block" title={flow.flow_id} trailing={<Tag size="xs">{t("nodes", { count: flow.node_count })}</Tag>} />
      </Link>
    </Surface>
  )
}

function WorkflowStep({ flows }: StepProps) {
  const t = useTranslations("setup.workflow")
  if (flows.length === 0) return <Empty title={t("empty")} hint={t("emptyHint")} />
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]}>
      <nav aria-label={t("navAria")} className="flex flex-col gap-1.5 p-1.5">
        {flows.map((flow) => (
          <FlowLink key={flow.flow_id} flow={flow} />
        ))}
      </nav>
    </TitledPanel>
  )
}

const STEP_BODY: Readonly<Record<SetupStep, (props: StepProps) => ReactNode>> = {
  agent: AgentStep,
  providers: ProvidersStep,
  workflow: WorkflowStep,
}

function SkipLink() {
  const t = useTranslations("setup.onboarding")
  const { flows } = setupRouteApi.useLoaderData()
  const landing = landingFlow(flows)
  if (landing.kind === "project") return null
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to={ROUTE_PATH.canvas} params={{ flowId: landing.flowId }}>
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

function BrandLine() {
  const t = useTranslations("setup.onboarding")
  return (
    <Toolbar end={<SkipLink />} className="justify-between">
      <Text role="item" weight="semibold">
        {t("brand")}
      </Text>
    </Toolbar>
  )
}

export function OnboardingScreen(): JSX.Element {
  const { project, flows, step } = setupRouteApi.useLoaderData()
  const t = useTranslations("setup.onboarding")
  const Body = STEP_BODY[step]
  return (
    <Page width="md">
      <div className="mx-auto flex max-w-[960px] flex-col gap-4">
        <BrandLine />
        <Heading size="page" title={t("title", { project: project.package ?? project.root })} below={[project.root, t("lead")]} />
        <StepNav step={step} />
        <Body flows={flows} />
        <StepFooter step={step} />
      </div>
    </Page>
  )
}
