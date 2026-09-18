import { useId, useState, type ChangeEvent, type ReactNode } from "react"
import { useTranslations } from "use-intl"
import type { ApiFlowSchemas, FlowId, RunId, RunMode } from "@/domain"
import { RUN_MODES } from "@/domain"
import type { ApiFailure, ApiProblem } from "@/api/client"
import { Actions, ChoiceGroup, Heading, Text, TitledPanel, Toolbar } from "@/components/studio"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useRunStart } from "./run-start"
import {
  emptyContext,
  emptyInput,
  fieldProblems,
  inputFields,
  readInput,
  runContext,
  unshownProblems,
  type ContextDraft,
  type FieldValue,
  type InputControl,
  type InputDraft,
  type InputField,
  type RunContextKey,
} from "./start-form"

export type StartRunProps = {
  readonly flowId: FlowId
  readonly schemas: ApiFlowSchemas
  readonly today: string
  readonly onStarted: (runId: RunId) => void
  readonly onCancel: () => void
}

type ControlProps = {
  readonly id: string
  readonly field: InputField
  readonly value: FieldValue
  readonly disabled: boolean
  readonly onChange: (value: FieldValue) => void
}

type FieldRowProps = {
  readonly id: string
  readonly label: string
  readonly problem: string | null
  readonly children: ReactNode
}

const AT_WORKING = "working"
const TRUE = "true"
const FALSE = "false"
const FIELD_CLASS = "mt-1.5"
const AREA_CLASS = "mt-1.5 min-h-19 px-3 py-2.75"
const CHOICE_CLASS = "mt-1.5"
const BODY_CLASS = "px-3 pt-0.5 pb-3"

const asText = (value: FieldValue): string => (typeof value === "string" ? value : "")

const bannerOf = (failure: ApiFailure | null, unshown: readonly ApiProblem[]): string | null => {
  if (failure === null) return null
  if (failure.problems.length === 0) return failure.message
  return unshown.length === 0 ? null : failure.message
}

function TextControl({ id, value, disabled, onChange }: ControlProps) {
  return (
    <Input
      id={id}
      className={FIELD_CLASS}
      value={asText(value)}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value)
      }}
    />
  )
}

function NumberControl({ id, value, disabled, onChange }: ControlProps) {
  return (
    <Input
      id={id}
      type="number"
      className={FIELD_CLASS}
      value={asText(value)}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value)
      }}
    />
  )
}

function AreaControl({ id, value, disabled, onChange }: ControlProps) {
  return (
    <Textarea
      id={id}
      className={AREA_CLASS}
      value={asText(value)}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(event.target.value)
      }}
    />
  )
}

function JsonControl({ id, value, disabled, onChange }: ControlProps) {
  return (
    <Textarea
      id={id}
      className={`${AREA_CLASS} font-mono`}
      value={asText(value)}
      disabled={disabled}
      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(event.target.value)
      }}
    />
  )
}

function BooleanControl({ field, value, disabled, onChange }: ControlProps) {
  const t = useTranslations("runs.start")
  return (
    <ChoiceGroup
      appearance="segmented"
      label={field.name}
      className={CHOICE_CLASS}
      items={[
        { value: TRUE, label: t("yes"), disabled },
        { value: FALSE, label: t("no"), disabled },
      ]}
      value={value === true ? TRUE : FALSE}
      onValueChange={(next) => {
        onChange(next === TRUE)
      }}
    />
  )
}

function EnumControl({ field, value, disabled, onChange }: ControlProps) {
  return (
    <ChoiceGroup
      appearance="segmented"
      label={field.name}
      className={CHOICE_CLASS}
      items={field.options.map((option) => ({ value: option, label: option, disabled }))}
      value={asText(value)}
      onValueChange={onChange}
    />
  )
}

const CONTROL_VIEW: Readonly<Record<InputControl, (props: ControlProps) => ReactNode>> = {
  text: TextControl,
  area: AreaControl,
  number: NumberControl,
  boolean: BooleanControl,
  enum: EnumControl,
  json: JsonControl,
}

function FieldRow({ id, label, problem, children }: FieldRowProps) {
  return (
    <div className="mt-3">
      <Text role="label" tone="neutral" asChild>
        <Label htmlFor={id}>{label}</Label>
      </Text>
      {children}
      {problem === null ? null : (
        <Text role="hint" tone="destructive" as="p" className="mt-1.5">
          {problem}
        </Text>
      )}
    </div>
  )
}

function ContextFieldRow({
  contextKey,
  value,
  disabled,
  problem,
  onChange,
}: {
  readonly contextKey: RunContextKey
  readonly value: string
  readonly disabled: boolean
  readonly problem: string | null
  readonly onChange: (value: string) => void
}) {
  const t = useTranslations("runs.start")
  const id = useId()
  return (
    <FieldRow id={id} label={t(`context.${contextKey}`)} problem={problem}>
      <Input
        id={id}
        type={contextKey === "date" ? "date" : "text"}
        className={FIELD_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          onChange(event.target.value)
        }}
      />
    </FieldRow>
  )
}

function InputFieldRow({
  field,
  value,
  disabled,
  problem,
  onChange,
}: {
  readonly field: InputField
  readonly value: FieldValue
  readonly disabled: boolean
  readonly problem: string | null
  readonly onChange: (value: FieldValue) => void
}) {
  const t = useTranslations("runs.start")
  const id = useId()
  const Control = CONTROL_VIEW[field.control]
  return (
    <FieldRow id={id} label={field.required ? field.name : t("optional", { label: field.name })} problem={problem}>
      <Control id={id} field={field} value={value} disabled={disabled} onChange={onChange} />
    </FieldRow>
  )
}

export function StartRun({ flowId, schemas, today, onStarted, onCancel }: StartRunProps) {
  const t = useTranslations("runs.start")
  const modeName = useTranslations("domain.runMode")
  const fields = inputFields(schemas.input)
  const contextKeys = schemas.context
  const [mode, setMode] = useState<RunMode>("live")
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() => emptyContext(contextKeys, today))
  const [inputDraft, setInputDraft] = useState<InputDraft>(() => emptyInput(fields))
  const [invalid, setInvalid] = useState<readonly string[]>([])
  const { pending, failure, start } = useRunStart(onStarted)

  const problems = failure?.problems ?? []
  const contextProblems = fieldProblems(problems, "context")
  const inputProblems = fieldProblems(problems, "input")
  const shown = [...contextKeys.map((key) => `context.${key}`), ...fields.map((field) => `input.${field.name}`)]
  const banner = bannerOf(failure, unshownProblems(problems, shown))

  const inputProblemOf = (name: string): string | null => {
    if (invalid.includes(name)) return t("invalidJson")
    return inputProblems.get(name) ?? null
  }

  const submit = (): void => {
    const result = readInput(fields, inputDraft)
    setInvalid(result.ok ? [] : result.invalid)
    if (!result.ok) return
    start({ flow_id: flowId, at: AT_WORKING, mode, context: runContext(contextKeys, contextDraft), input: result.value })
  }

  return (
    <div className="min-w-0">
      <Heading size="page" title={t("title")} below={[t("subtitle", { flow: flowId })]} />
      <TitledPanel size="block" title={t("modeTitle")} className="mt-4">
        <div className={BODY_CLASS}>
          <div className="mt-3">
            <ChoiceGroup
              appearance="segmented"
              label={t("modeTitle")}
              items={RUN_MODES.map((value) => ({ value, label: modeName(value), disabled: pending }))}
              value={mode}
              onValueChange={setMode}
            />
          </div>
        </div>
      </TitledPanel>
      <TitledPanel
        size="block"
        title={t("contextTitle")}
        description={t("contextHint")}
        className="mt-4"
        empty={contextKeys.length === 0 ? t("noContext") : undefined}
      >
        <div className={BODY_CLASS}>
          {contextKeys.map((key) => (
            <ContextFieldRow
              key={key}
              contextKey={key}
              value={contextDraft.get(key) ?? ""}
              disabled={pending}
              problem={contextProblems.get(key) ?? null}
              onChange={(value) => {
                setContextDraft((current) => new Map(current).set(key, value))
              }}
            />
          ))}
        </div>
      </TitledPanel>
      <TitledPanel size="block" title={t("inputTitle")} className="mt-4" empty={fields.length === 0 ? t("noInput") : undefined}>
        <div className={BODY_CLASS}>
          {fields.map((field) => (
            <InputFieldRow
              key={field.name}
              field={field}
              value={inputDraft.get(field.name) ?? ""}
              disabled={pending}
              problem={inputProblemOf(field.name)}
              onChange={(value) => {
                setInputDraft((current) => new Map(current).set(field.name, value))
              }}
            />
          ))}
        </div>
      </TitledPanel>
      <Toolbar wrap aria-busy={pending} className="mt-3 gap-2 px-0">
        <Actions
          actions={[
            { id: "submit", label: t("submit"), variant: "default", pending, onClick: submit },
            { id: "cancel", label: t("cancel"), disabled: pending, onClick: onCancel },
          ]}
        />
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
