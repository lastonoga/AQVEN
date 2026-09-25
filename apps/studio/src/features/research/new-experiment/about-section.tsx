import { useId } from "react"
import { useTranslations } from "use-intl"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ResearchSection } from "../layout"
import { Field, Panel } from "./form-field"
import { specPath } from "./spec"
import { visibleAt, type FormView } from "./view"

const ID_PLACEHOLDER = "cheaper_agent_holds_quality"

export function AboutSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.about")
  const describeId = useId()
  const nameId = useId()
  const { form, dispatch, disabled } = view
  const descriptionProblems = visibleAt(view, "description")
  const idProblems = visibleAt(view, "id")
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      <Panel>
        <Field id={describeId} label={t("question")} hint={t("questionHint")} problems={descriptionProblems}>
          <Textarea
            id={describeId}
            value={form.description}
            disabled={disabled}
            aria-invalid={descriptionProblems.length > 0}
            placeholder={t("questionPlaceholder")}
            className="min-h-19"
            onChange={(event) => {
              dispatch({ type: "describe", text: event.target.value })
            }}
          />
        </Field>
        <Field id={nameId} label={t("id")} hint={t("idHint", { path: specPath(form.id.length === 0 ? "<id>" : form.id) })} problems={idProblems}>
          <Input
            id={nameId}
            value={form.id}
            disabled={disabled}
            aria-invalid={idProblems.length > 0}
            spellCheck={false}
            autoComplete="off"
            placeholder={ID_PLACEHOLDER}
            className="max-w-md font-mono"
            onChange={(event) => {
              dispatch({ type: "rename", id: event.target.value })
            }}
          />
        </Field>
      </Panel>
    </ResearchSection>
  )
}
