import { Minus, Plus } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { stepBounds, stepNumber } from "./number-step"

export type NumberStepperProps = {
  readonly id?: string | undefined
  readonly label: string
  readonly value: string
  readonly min: number
  readonly max: number
  readonly invalid: boolean
  readonly describedBy?: string | undefined
  readonly decreaseLabel: string
  readonly increaseLabel: string
  readonly onChange: (value: string) => void
}

const STEP_DOWN = -1
const STEP_UP = 1
const PLAIN_NUMBER = "text-center font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

export function NumberStepper({ id, label, value, min, max, invalid, describedBy, decreaseLabel, increaseLabel, onChange }: NumberStepperProps) {
  const bounds = stepBounds(value, min, max)
  return (
    <InputGroup className="w-30 shrink-0">
      <InputGroupAddon align="inline-start">
        <InputGroupButton
          size="icon-xs"
          aria-label={decreaseLabel}
          disabled={bounds.atMin}
          onClick={() => {
            onChange(stepNumber(value, STEP_DOWN, min, max))
          }}
        >
          <Minus aria-hidden />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={PLAIN_NUMBER}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={increaseLabel}
          disabled={bounds.atMax}
          onClick={() => {
            onChange(stepNumber(value, STEP_UP, min, max))
          }}
        >
          <Plus aria-hidden />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
