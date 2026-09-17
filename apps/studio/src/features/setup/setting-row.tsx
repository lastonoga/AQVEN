import { useState, type ReactNode } from "react"
import { ChoiceGroup, hasContent, Heading, Toolbar, type ChoiceItem } from "@/components/studio"
import { Input } from "@/components/ui/input"

export type SettingRowProps = {
  readonly title: ReactNode
  readonly hint?: ReactNode
  readonly detail?: ReactNode
  readonly children: ReactNode
}

export function SettingRow({ title, hint, detail, children }: SettingRowProps) {
  const below = [hint, detail].filter(hasContent)
  return (
    <Toolbar size="card" wrap end={children} className="justify-between">
      <Heading size="block" title={title} below={below} />
    </Toolbar>
  )
}

export type ChoiceRowProps<V extends string> = {
  readonly title: ReactNode
  readonly hint?: ReactNode
  readonly detail?: ReactNode
  readonly label: string
  readonly items: readonly ChoiceItem<V>[]
  readonly value: V
  readonly onValueChange: (value: V) => void
}

export function ChoiceRow<V extends string>({ title, hint, detail, label, items, value, onValueChange }: ChoiceRowProps<V>) {
  return (
    <SettingRow title={title} hint={hint} detail={detail}>
      <ChoiceGroup appearance="segmented" label={label} items={items} value={value} onValueChange={onValueChange} />
    </SettingRow>
  )
}

export type ChoiceSettingProps<V extends string> = Omit<ChoiceRowProps<V>, "value" | "onValueChange" | "detail"> & {
  readonly initial: V
  readonly detailOf?: (value: V) => ReactNode
}

export function ChoiceSetting<V extends string>({ initial, detailOf, ...row }: ChoiceSettingProps<V>) {
  const [value, setValue] = useState<V>(initial)
  return <ChoiceRow {...row} detail={detailOf?.(value)} value={value} onValueChange={setValue} />
}

export type NumberSettingProps = {
  readonly title: ReactNode
  readonly hint?: ReactNode
  readonly label: string
  readonly placeholder: string
  readonly initial: number | null
  readonly min: number
  readonly step: number
}

export function NumberSetting({ title, hint, label, placeholder, initial, min, step }: NumberSettingProps) {
  const [value, setValue] = useState(initial === null ? "" : String(initial))
  return (
    <SettingRow title={title} hint={hint}>
      <Input
        type="number"
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        min={min}
        step={step}
        value={value}
        className="w-32"
        onChange={(event) => {
          setValue(event.target.value)
        }}
      />
    </SettingRow>
  )
}

export function SettingRows({ children }: { readonly children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>
}
