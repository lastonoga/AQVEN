import { useId } from "react"
import { useTranslations } from "use-intl"
import { Input } from "@/components/ui/input"
import { ResearchSection } from "../layout"
import { Field, Panel, Problems } from "./form-field"
import { MAX_REPEATS } from "./form-state"
import { visibleAt, type FormView } from "./view"

export function PlanSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.plan")
  const casesId = useId()
  const repeatsId = useId()
  const { form, dispatch, disabled } = view
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      <Panel>
        <Field id={casesId} label={t("cases")} hint={t("casesHint")}>
          <Input
            id={casesId}
            inputMode="numeric"
            value={form.plan.cases}
            disabled={disabled}
            placeholder={t("everyCase")}
            className="w-44 font-mono"
            onChange={(event) => {
              dispatch({ type: "editPlan", patch: { cases: event.target.value } })
            }}
          />
        </Field>
        <Field id={repeatsId} label={t("repeats")} hint={t("repeatsHint", { max: MAX_REPEATS })}>
          <Input
            id={repeatsId}
            inputMode="numeric"
            value={form.plan.repeats}
            disabled={disabled}
            className="w-24 font-mono"
            onChange={(event) => {
              dispatch({ type: "editPlan", patch: { repeats: event.target.value } })
            }}
          />
        </Field>
        <Problems problems={visibleAt(view, "plan")} />
      </Panel>
    </ResearchSection>
  )
}
