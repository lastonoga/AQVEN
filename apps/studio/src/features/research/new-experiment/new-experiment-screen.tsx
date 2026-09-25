import { useReducer, useState, type SubmitEvent } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { AuthoringOptions } from "@/domain"
import { Heading, Page, Text, Toolbar } from "@/components/studio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { newExperimentRouteApi, ROUTE_PATH } from "@/lib/routes"
import { useAuthoringOptions } from "../authoring"
import { AboutSection } from "./about-section"
import { CasesSection } from "./cases-section"
import { ChecksSection } from "./checks-section"
import { CreateBar } from "./create-bar"
import { initialForm, reduceForm } from "./form-state"
import { draftPrompt } from "./handoff"
import { PlanSection } from "./plan-section"
import { formProblems } from "./problems"
import { QuestionSection } from "./question-section"
import { createOf } from "./spec"
import { SubjectSection } from "./subject-section"
import { useCreateExperiment } from "./use-create-experiment"
import { VariantsSection } from "./variants-section"
import { useProblemText, type FormView } from "./view"

const ALL_FLOWS = null

function Header() {
  const t = useTranslations("research.newExperiment")
  return (
    <Toolbar
      wrap
      className="items-start gap-2.5"
      end={
        <Text role="link" tone="neutral" asChild>
          <Link to={ROUTE_PATH.research} className="underline-offset-3 hover:underline">
            {t("back")}
          </Link>
        </Text>
      }
    >
      <Heading size="page" title={t("title")} below={[t("subtitle")]} />
    </Toolbar>
  )
}

function ExperimentForm({ options, taken }: { readonly options: AuthoringOptions; readonly taken: readonly string[] }) {
  const t = useTranslations("research.newExperiment")
  const [form, dispatch] = useReducer(reduceForm, undefined, initialForm)
  const [shown, setShown] = useState(false)
  const creator = useCreateExperiment()
  const describe = useProblemText()
  const problems = formProblems(form, { options, taken })
  const view: FormView = {
    form,
    options,
    problems,
    shown,
    disabled: creator.state.kind === "pending",
    dispatch,
    draft: () => draftPrompt(form, problems, describe),
  }
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    setShown(true)
    if (problems.length > 0) return
    creator.create(createOf(form))
  }
  return (
    <form noValidate aria-label={t("formAria")} className="flex min-w-0 flex-col gap-7" onSubmit={submit}>
      <AboutSection view={view} />
      <SubjectSection view={view} />
      <VariantsSection view={view} />
      <CasesSection view={view} />
      <ChecksSection view={view} />
      <QuestionSection view={view} />
      <PlanSection view={view} />
      <CreateBar view={view} state={creator.state} />
    </form>
  )
}

function OptionsFailed({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  const t = useTranslations("research.newExperiment")
  return (
    <Alert variant="destructive">
      <AlertTitle>{t("loadFailed")}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        {t("retry")}
      </Button>
    </Alert>
  )
}

function NewExperimentBody({ taken }: { readonly taken: readonly string[] }) {
  const t = useTranslations("research.newExperiment")
  const [revision, setRevision] = useState(0)
  const state = useAuthoringOptions(ALL_FLOWS, revision)
  if (state.kind === "ready") return <ExperimentForm options={state.options} taken={taken} />
  if (state.kind === "failed") {
    return (
      <OptionsFailed
        message={state.message}
        onRetry={() => {
          setRevision((current) => current + 1)
        }}
      />
    )
  }
  return (
    <Text as="p" role="hint" tone="neutral" aria-busy="true">
      {t("loading")}
    </Text>
  )
}

export function NewExperimentScreen() {
  const { taken } = newExperimentRouteApi.useLoaderData()
  return (
    <Page width="md" header={<Header />}>
      <NewExperimentBody taken={taken} />
    </Page>
  )
}
