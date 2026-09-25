import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { CreatedExperiment } from "@/domain"
import { Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { HandoffButton } from "@/features/chat-handoff"
import { ROUTE_PATH } from "@/lib/routes"
import { FailureReport, WrittenReport } from "../authoring"
import { Problems } from "./form-field"
import { specPath } from "./spec"
import type { CreateState } from "./use-create-experiment"
import type { FormView } from "./view"

type CreateBarProps = { readonly view: FormView; readonly state: CreateState }

function WrittenWithErrors({ created, draft }: { readonly created: CreatedExperiment; readonly draft: () => string }) {
  const t = useTranslations("research.newExperiment.create")
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text as="p" role="hint" tone="warning" className="wrap-anywhere">
        {t("writtenWithErrors", { file: created.file })}
      </Text>
      <WrittenReport file={created.file} diagnostics={created.diagnostics} />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Text role="link" tone="default" asChild>
          <Link to={ROUTE_PATH.experiment} params={{ experimentId: created.experiment }} className="inline-flex items-center gap-1 underline-offset-3 hover:underline">
            {t("open", { id: created.experiment })}
            <ArrowUpRight aria-hidden className="size-3" />
          </Link>
        </Text>
        <HandoffButton label={t("askFix")} prompt={draft} />
      </div>
    </div>
  )
}

function Outcome({ view, state }: CreateBarProps) {
  if (state.kind === "failed") return <FailureReport failure={state.failure} file={specPath(view.form.id)} />
  if (state.kind === "written") return <WrittenWithErrors created={state.created} draft={view.draft} />
  return null
}

function OpenProblems({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.create")
  if (!view.shown || view.problems.length === 0) return null
  return (
    <div role="alert" className="flex min-w-0 flex-col gap-1">
      <Text as="p" role="hint" tone="destructive" weight="medium">
        {t("fixFirst", { count: view.problems.length })}
      </Text>
      <Problems problems={view.problems} />
    </div>
  )
}

export function CreateBar({ view, state }: CreateBarProps) {
  const t = useTranslations("research.newExperiment.create")
  const pending = state.kind === "pending"
  return (
    <Surface variant="panel" padding="sm" role="region" aria-label={t("aria")} className="flex min-w-0 flex-col gap-3">
      <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
        {t("explain", { file: specPath(view.form.id.length === 0 ? "<id>" : view.form.id) })}
      </Text>
      <OpenProblems view={view} />
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
          {pending ? <Spinner aria-hidden="true" /> : null}
          {t("submit")}
        </Button>
        <HandoffButton label={t("askDraft")} prompt={view.draft} disabled={pending} />
      </div>
      <Outcome view={view} state={state} />
    </Surface>
  )
}
