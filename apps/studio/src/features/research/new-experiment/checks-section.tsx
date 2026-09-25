import { useId } from "react"
import { Trash2 } from "lucide-react"
import { useTranslations } from "use-intl"
import { CHECK_KINDS, type AuthoringEvaluator, type EvaluatorParam } from "@/domain"
import { ChoiceGroup, Surface, Tag, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ResearchSection } from "../layout"
import type { ValueChoice } from "./factor"
import { Field, Problems } from "./form-field"
import type { CheckDraft } from "./form-state"
import { OptionPicker } from "./option-picker"
import { EXPECTED_USE } from "./spec"
import { visibleAt, type FormView } from "./view"

type CheckProps = { readonly view: FormView; readonly check: CheckDraft; readonly evaluator: AuthoringEvaluator | null }

const evaluatorChoices = (evaluators: readonly AuthoringEvaluator[]): readonly ValueChoice[] =>
  evaluators.map((evaluator) => ({ value: evaluator.use, label: evaluator.use, detail: evaluator.description }))

const evaluatorOf = (evaluators: readonly AuthoringEvaluator[], use: string): AuthoringEvaluator | null =>
  evaluators.find((evaluator) => evaluator.use === use) ?? null

const PARAM_JOIN = ", "

function CheckId({ view, check }: CheckProps) {
  const t = useTranslations("research.newExperiment.checks")
  const id = useId()
  return (
    <Field id={id} label={t("id")} hint={t("idHint")}>
      <Input
        id={id}
        value={check.id}
        disabled={view.disabled}
        spellCheck={false}
        autoComplete="off"
        className="max-w-xs font-mono"
        onChange={(event) => {
          view.dispatch({ type: "editCheck", key: check.key, patch: { id: event.target.value } })
        }}
      />
    </Field>
  )
}

function CheckKindChoice({ view, check }: CheckProps) {
  const t = useTranslations("research.newExperiment.checks")
  const kinds = useTranslations("research.vocabulary.checkKind")
  return (
    <Field label={t("kind")}>
      <ChoiceGroup
        appearance="segmented"
        size="sm"
        label={t("kindAria", { check: check.id })}
        items={CHECK_KINDS.map((kind) => ({ value: kind, label: kinds(kind), disabled: view.disabled }))}
        value={check.kind}
        onValueChange={(kind) => {
          view.dispatch({ type: "editCheck", key: check.key, patch: { kind } })
        }}
        className="self-start"
      />
    </Field>
  )
}

function ExpectedFields({ view, check }: CheckProps) {
  const t = useTranslations("research.newExperiment.checks")
  const id = useId()
  if (check.use !== EXPECTED_USE) return null
  return (
    <Field id={id} label={t("fields")} hint={t("fieldsHint")}>
      <Input
        id={id}
        value={check.fields}
        disabled={view.disabled}
        spellCheck={false}
        autoComplete="off"
        placeholder={t("fieldsPlaceholder")}
        className="max-w-md font-mono"
        onChange={(event) => {
          view.dispatch({ type: "editCheck", key: check.key, patch: { fields: event.target.value } })
        }}
      />
    </Field>
  )
}

function useParamNames(): (params: readonly EvaluatorParam[]) => string {
  const t = useTranslations("research.newExperiment.checks")
  return (params) => params.map((param) => (param.required ? param.name : t("optionalParam", { name: param.name }))).join(PARAM_JOIN)
}

function CheckParams({ view, check, evaluator }: CheckProps) {
  const t = useTranslations("research.newExperiment.checks")
  const id = useId()
  const names = useParamNames()
  if (evaluator === null || !evaluator.needsParams) return null
  return (
    <Field id={id} label={t("params")} hint={t("paramsHint", { params: names(evaluator.params) })}>
      <Textarea
        id={id}
        value={check.params}
        disabled={view.disabled}
        spellCheck={false}
        className="min-h-16 font-mono text-sm"
        onChange={(event) => {
          view.dispatch({ type: "editCheck", key: check.key, patch: { params: event.target.value } })
        }}
      />
    </Field>
  )
}

function CheckRow(props: CheckProps) {
  const t = useTranslations("research.newExperiment.checks")
  const { view, check, evaluator } = props
  return (
    <li>
      <Surface variant="panel" padding="sm" role="group" aria-label={t("checkAria", { check: check.id })} className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Tag size="xs" tone="primary" fill="outline" className="self-start">
              {t("builtin", { use: check.use })}
            </Tag>
            {evaluator === null ? null : (
              <Text as="p" role="hint" tone="neutral" className="wrap-anywhere">
                {evaluator.description}
              </Text>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={view.disabled}
            aria-label={t("remove", { check: check.id })}
            onClick={() => {
              view.dispatch({ type: "removeCheck", key: check.key })
            }}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
        <CheckId {...props} />
        <CheckKindChoice {...props} />
        <ExpectedFields {...props} />
        <CheckParams {...props} />
        <Problems problems={visibleAt(view, `check:${String(check.key)}`)} />
      </Surface>
    </li>
  )
}

function AddCheck({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.checks")
  const { evaluators } = view.options
  if (evaluators.length === 0) {
    return (
      <Text as="p" role="hint" tone="neutral">
        {t("noEvaluators")}
      </Text>
    )
  }
  return (
    <OptionPicker
      choices={evaluatorChoices(evaluators)}
      value={null}
      disabled={view.disabled}
      copy={{
        trigger: t("add"),
        placeholder: t("add"),
        search: t("search"),
        count: t("evaluatorCount", { count: evaluators.length }),
        empty: t("noMatches"),
      }}
      onChoose={(use) => {
        const evaluator = evaluatorOf(evaluators, use)
        if (evaluator === null) return
        view.dispatch({ type: "addCheck", use, kind: evaluator.kind })
      }}
    />
  )
}

export function ChecksSection({ view }: { readonly view: FormView }) {
  const t = useTranslations("research.newExperiment.checks")
  const { checks } = view.form
  return (
    <ResearchSection title={t("title")} description={t("description")}>
      {checks.length === 0 ? (
        <Text as="p" role="hint" tone="neutral">
          {t("none")}
        </Text>
      ) : (
        <ul className="flex min-w-0 flex-col gap-3">
          {checks.map((check) => (
            <CheckRow key={check.key} view={view} check={check} evaluator={evaluatorOf(view.options.evaluators, check.use)} />
          ))}
        </ul>
      )}
      <AddCheck view={view} />
    </ResearchSection>
  )
}
