import { useState } from "react"
import { useTranslations } from "use-intl"
import type { ApiJsonObject } from "@/domain"
import type { ApiProblem } from "@/api/client"
import { Actions, Text, Toolbar } from "@/components/studio"
import { Separator } from "@/components/ui/separator"
import { clientOpId, runId } from "@/data/ids"
import { useReviewDecision } from "@/routes/-review-decision"
import { FormFieldControl } from "./form-field"
import type { ReviewEntry } from "./presenters"
import { emptyDraft, RAW_FIELD, readPayload, readWaitForm, type AnswerDraft, type FieldValue, type FormField } from "./wait-form"

export type DecisionFormProps = { readonly entry: ReviewEntry; readonly schema: ApiJsonObject | null }

const PAYLOAD_PATH = "payload"

const problemField = (problem: ApiProblem): string => (problem.path[0] === PAYLOAD_PATH ? String(problem.path[1] ?? "") : "")

const serverProblems = (problems: readonly ApiProblem[]): ReadonlyMap<string, string> =>
  new Map(problems.map((problem) => [problemField(problem), problem.message]))

export function DecisionForm({ entry, schema }: DecisionFormProps) {
  const t = useTranslations("review")
  const form = readWaitForm(schema)
  const [draft, setDraft] = useState<AnswerDraft>(() => emptyDraft(form))
  const [invalid, setInvalid] = useState<readonly string[]>([])
  const [opId] = useState(clientOpId)
  const { pending, failure, resume } = useReviewDecision()

  const rawField: FormField = { control: "json", name: RAW_FIELD, label: t("field.rawLabel"), required: true, nullable: false }
  const fields = form.kind === "fields" ? form.fields : [rawField]
  const fromServer = serverProblems(failure?.problems ?? [])
  const banner = failure === null || fromServer.size > 0 ? null : t("decision.rejected", { reason: failure.message })

  const problemOf = (name: string): string | null => {
    if (invalid.includes(name)) return t("field.invalidJson")
    return fromServer.get(name) ?? null
  }

  const write = (name: string, value: FieldValue): void => {
    setDraft((current) => new Map(current).set(name, value))
  }

  const submit = (): void => {
    const result = readPayload(form, draft)
    setInvalid(result.ok ? [] : result.invalid)
    if (!result.ok) return
    resume({
      runId: runId(entry.run.run_id),
      address: entry.wait.address,
      attempt: entry.wait.attempt,
      payload: result.payload,
      clientOpId: opId,
    })
  }

  return (
    <div>
      <Separator className="mt-3.5 mb-3.25" />
      <Text role="label" tone="neutral" as="div">
        {t("detail.answer", { form: entry.wait.form_type_id })}
      </Text>
      {fields.map((field) => (
        <FormFieldControl
          key={field.name}
          field={field}
          value={draft.get(field.name) ?? null}
          disabled={pending}
          problem={problemOf(field.name)}
          onChange={(value) => {
            write(field.name, value)
          }}
        />
      ))}
      <Toolbar wrap aria-busy={pending} className="mt-3 gap-2">
        <Actions actions={[{ id: "submit", label: t("decision.submit"), variant: "default", pending, onClick: submit }]} />
      </Toolbar>
      {banner === null ? null : (
        <Text role="hint" tone="destructive" asChild>
          <p role="alert" className="mt-2.5">
            {banner}
          </p>
        </Text>
      )}
    </div>
  )
}
