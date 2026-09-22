import { useId, type ChangeEvent, type ReactNode } from "react"
import { useTranslations } from "use-intl"
import { ChoiceGroup, Text } from "@/components/studio"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ControlKind, FieldOf, FieldValue, FormField } from "./wait-form"

export type FormFieldProps = {
  readonly field: FormField
  readonly value: FieldValue
  readonly disabled: boolean
  readonly problem: string | null
  readonly onChange: (value: FieldValue) => void
}

type ControlProps<K extends ControlKind> = {
  readonly id: string
  readonly field: FieldOf<K>
  readonly value: FieldValue
  readonly disabled: boolean
  readonly onChange: (value: FieldValue) => void
}

const TRUE = "true"
const FALSE = "false"
const CHOICE_CLASS = "mt-1.5"
const FIELD_CLASS = "mt-1.5"
const AREA_CLASS = "mt-1.5 min-h-19 px-3 py-2.75"

const asText = (value: FieldValue): string => (typeof value === "string" ? value : "")

const choiceClass = (disabled: boolean): string => (disabled ? `${CHOICE_CLASS} pointer-events-none opacity-60` : CHOICE_CLASS)

function BooleanControl({ field, value, disabled, onChange }: ControlProps<"boolean">) {
  const t = useTranslations("review")
  return (
    <ChoiceGroup
      appearance="segmented"
      label={field.label}
      className={choiceClass(disabled)}
      items={[
        { value: TRUE, label: t("field.yes") },
        { value: FALSE, label: t("field.no") },
      ]}
      value={value === true ? TRUE : FALSE}
      onValueChange={(next) => {
        onChange(next === TRUE)
      }}
    />
  )
}

function EnumControl({ field, value, disabled, onChange }: ControlProps<"enum">) {
  return (
    <ChoiceGroup
      appearance="segmented"
      label={field.label}
      className={choiceClass(disabled)}
      items={field.options.map((option) => ({ value: option, label: option }))}
      value={asText(value)}
      onValueChange={onChange}
    />
  )
}

function TextControl({ id, field, value, disabled, onChange }: ControlProps<"text">) {
  const write = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(event.target.value)
  }
  if (field.multiline) {
    return <Textarea id={id} className={AREA_CLASS} value={asText(value)} disabled={disabled} maxLength={field.maxLength ?? undefined} onChange={write} />
  }
  return <Input id={id} className={FIELD_CLASS} value={asText(value)} disabled={disabled} maxLength={field.maxLength ?? undefined} onChange={write} />
}

function NumberControl({ id, value, disabled, onChange }: ControlProps<"number">) {
  return (
    <Input
      id={id}
      type="number"
      className={FIELD_CLASS}
      value={asText(value)}
      disabled={disabled}
      onChange={(event) => {
        onChange(event.target.value)
      }}
    />
  )
}

function JsonControl({ id, value, disabled, onChange }: ControlProps<"json">) {
  return (
    <Textarea
      id={id}
      className={`${AREA_CLASS} font-mono`}
      value={asText(value)}
      disabled={disabled}
      onChange={(event) => {
        onChange(event.target.value)
      }}
    />
  )
}

const CONTROL_VIEW: { readonly [K in ControlKind]: (props: ControlProps<K>) => ReactNode } = {
  boolean: BooleanControl,
  enum: EnumControl,
  text: TextControl,
  number: NumberControl,
  json: JsonControl,
}

const renderControl = <K extends ControlKind>(field: FieldOf<K>, props: Omit<ControlProps<K>, "field">): ReactNode => {
  const View: (props: ControlProps<K>) => ReactNode = CONTROL_VIEW[field.control]
  return View({ ...props, field })
}

export function FormFieldControl({ field, value, disabled, problem, onChange }: FormFieldProps) {
  const t = useTranslations("review")
  const id = useId()
  return (
    <div className="mt-3">
      <Text role="label" tone="neutral" asChild>
        <Label htmlFor={id}>{field.required ? field.label : t("field.optional", { label: field.label })}</Label>
      </Text>
      {renderControl(field, { id, value, disabled, onChange })}
      {problem === null ? null : (
        <Text role="hint" tone="destructive" as="p" className="mt-1.5">
          {problem}
        </Text>
      )}
    </div>
  )
}
