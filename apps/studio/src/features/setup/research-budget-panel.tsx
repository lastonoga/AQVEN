import { useState, type SubmitEvent } from "react"
import { useTranslations } from "use-intl"
import type { ApiResearchBudget } from "@/domain"
import { Heading, PropertyList, Text, TitledPanel } from "@/components/studio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { capDraftOf, capText, isCapDraft } from "./presenters"
import { useResearchBudget, type ResearchBudgetState } from "./research-budget"

const CAP_STEP = "0.01"
const CAP_MIN = 0

type BudgetProps = { readonly budget: ApiResearchBudget; readonly state: ResearchBudgetState }

function OverrideNote({ budget, state }: BudgetProps) {
  const t = useTranslations("setup.settings.budget")
  const project = budget.project_usd === null ? t("notInProject") : capText(budget.project_usd)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
      <Text as="p" role="hint" tone={budget.override_problem === null ? "neutral" : "warning"} className="min-w-0 flex-1 wrap-anywhere">
        {budget.override_problem ?? t("overrideNote", { project })}
      </Text>
      <Button variant="outline" size="xs" disabled={state.pending} aria-busy={state.pending} onClick={state.removeOverride}>
        {t("removeOverride")}
      </Button>
    </div>
  )
}

function FailureLine({ message }: { readonly message: string }) {
  const t = useTranslations("setup.settings.budget")
  return (
    <p role="alert" className="px-3 pb-3 text-xs text-destructive">
      {t("failed", { message })}
    </p>
  )
}

function CapForm({ budget, state, fileHash }: BudgetProps & { readonly fileHash: string }) {
  const t = useTranslations("setup.settings.budget")
  const [draft, setDraft] = useState(capDraftOf(budget))
  const valid = isCapDraft(draft)
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!valid) return
    state.save(fileHash, draft.trim())
  }
  return (
    <form className="flex flex-col gap-2 border-t border-border p-3" onSubmit={submit}>
      <Heading size="block" title={t("edit")} below={[t("editHint")]} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={CAP_MIN}
          step={CAP_STEP}
          aria-label={t("inputAria")}
          aria-invalid={!valid || state.failure !== null}
          value={draft}
          disabled={state.pending}
          className="w-32"
          onChange={(event) => {
            setDraft(event.target.value)
          }}
        />
        <Button type="submit" size="sm" disabled={!valid || state.pending} aria-busy={state.pending}>
          {state.pending ? <Spinner aria-hidden="true" /> : null}
          {t("save")}
        </Button>
      </div>
    </form>
  )
}

function BudgetEditor({ budget, state }: BudgetProps) {
  const t = useTranslations("setup.settings.budget")
  const cap = budget.spend_cap_usd === null ? t("unusable") : capText(budget.spend_cap_usd)
  return (
    <>
      <PropertyList
        rows={[
          { key: t("cap"), value: cap },
          { key: t("source"), value: t(`sources.${budget.source}`) },
        ]}
      />
      {budget.source === "override" ? <OverrideNote budget={budget} state={state} /> : null}
      {budget.project_file === null ? null : <CapForm budget={budget} state={state} fileHash={budget.project_file.file_hash} />}
      {state.failure === null ? null : <FailureLine message={state.failure} />}
    </>
  )
}

function BudgetBody({ state }: { readonly state: ResearchBudgetState }) {
  const t = useTranslations("setup.settings.budget")
  const { load } = state
  if (load.kind === "ready") return <BudgetEditor budget={load.budget} state={state} />
  if (load.kind === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("loadError")}</AlertTitle>
        <AlertDescription>{load.message}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={state.retry}>
          {t("retry")}
        </Button>
      </Alert>
    )
  }
  return (
    <p role="status" className="p-3 text-sm text-muted-foreground">
      {t("loading")}
    </p>
  )
}

export function ResearchBudgetSection() {
  const t = useTranslations("setup.settings.budget")
  const state = useResearchBudget()
  return (
    <TitledPanel size="section" title={t("title")} below={[t("description")]}>
      <BudgetBody state={state} />
    </TitledPanel>
  )
}
