import { useState } from "react"
import { PickerCommand, PickerCount, PickerOption, PickerTrigger, Text } from "@/components/studio"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ValueChoice } from "./factor"

export type OptionPickerCopy = {
  readonly trigger: string
  readonly placeholder: string
  readonly search: string
  readonly count: string
  readonly empty: string
}

export type OptionPickerProps = {
  readonly choices: readonly ValueChoice[]
  readonly value: string | null
  readonly copy: OptionPickerCopy
  readonly invalid?: boolean
  readonly disabled?: boolean
  readonly onChoose: (value: string) => void
}

const chosenOf = (choices: readonly ValueChoice[], value: string | null): ValueChoice | null => choices.find((choice) => choice.value === value) ?? null

function ChoiceRow({ choice, checked, onChoose }: { readonly choice: ValueChoice; readonly checked: boolean; readonly onChoose: () => void }) {
  return (
    <PickerOption value={`${choice.label} ${choice.value}`} onSelect={onChoose} data-checked={checked} aria-current={checked ? "true" : undefined} className="py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-mono font-medium">{choice.label}</span>
        {choice.detail === null ? null : <span className="mt-0.5 block truncate text-xs text-muted-foreground">{choice.detail}</span>}
      </span>
    </PickerOption>
  )
}

export function OptionPicker({ choices, value, copy, invalid = false, disabled = false, onChoose }: OptionPickerProps) {
  const [open, setOpen] = useState(false)
  const chosen = chosenOf(choices, value)
  const choose = (next: string): void => {
    setOpen(false)
    onChoose(next)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger aria-expanded={open} aria-label={copy.trigger} aria-invalid={invalid} disabled={disabled} className="w-full max-w-md">
          <Text role="item" weight={chosen === null ? "normal" : "semibold"} tone={chosen === null ? "neutral" : "default"} truncate className="min-w-0 font-mono">
            {chosen?.label ?? copy.placeholder}
          </Text>
          {chosen === null || chosen.detail === null ? null : (
            <Text role="tiny" tone="neutral" truncate className="min-w-0 shrink">
              {chosen.detail}
            </Text>
          )}
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-96 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand label={copy.search}>
          <CommandInput aria-label={copy.search} placeholder={copy.search} />
          <PickerCount>{copy.count}</PickerCount>
          <CommandList label={copy.trigger}>
            <CommandEmpty>{copy.empty}</CommandEmpty>
            {choices.map((choice) => (
              <ChoiceRow
                key={choice.value}
                choice={choice}
                checked={choice.value === value}
                onChoose={() => {
                  choose(choice.value)
                }}
              />
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  )
}
