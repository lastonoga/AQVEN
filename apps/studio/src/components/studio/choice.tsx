import type { ComponentProps, ReactNode } from "react"
import { createLink, type LinkComponent } from "@tanstack/react-router"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { textVariants } from "./text"
import type { Tone } from "./tone"

export type ChoiceAppearance = "segmented" | "chip" | "card" | "toggle"

export type ChoiceSize = "sm" | "md"

export type ChoiceItem<V extends string> = { readonly value: V; readonly label: ReactNode; readonly disabled?: boolean }

type ChoiceGroupBase<V extends string> = {
  readonly appearance: ChoiceAppearance
  readonly size?: ChoiceSize
  readonly tone?: Tone
  readonly items: readonly ChoiceItem<V>[]
  readonly label: string
  readonly className?: string
}

export type ChoiceGroupProps<V extends string> = ChoiceGroupBase<V> &
  (
    | { readonly deselectable: true; readonly value: NoInfer<V> | null; readonly onValueChange: (value: NoInfer<V> | null) => void }
    | { readonly deselectable?: false; readonly value: NoInfer<V>; readonly onValueChange: (value: NoInfer<V>) => void }
  )

export type ChoiceListProps = {
  readonly appearance: ChoiceAppearance
  readonly label: string
  readonly className?: string
  readonly children: ReactNode
}

type ChoiceAnchorProps = ComponentProps<"a"> & {
  readonly appearance: ChoiceAppearance
  readonly size?: ChoiceSize
  readonly tone?: Tone
  readonly selected?: boolean
}

const DEFAULT_TONE: Tone = "llm"
const NO_VALUE = ""

const choiceListVariants = cva("", {
  variants: {
    appearance: {
      segmented: "inline-flex min-w-0 gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.75",
      chip: "flex items-center gap-1.75 overflow-x-auto",
      card: "flex items-center gap-2 overflow-x-auto pb-0.5",
      toggle: "flex items-center gap-1.75",
    },
  },
})

const choiceItemVariants = cva("", {
  variants: {
    appearance: {
      segmented: cn(
        "inline-flex h-7 items-center rounded-md border border-transparent px-3 whitespace-nowrap text-muted-foreground hover:text-foreground selected:border-border selected:bg-background selected:text-foreground selected:shadow-xs",
        textVariants({ role: "prose", weight: "medium" }),
        "leading-none",
      ),
      chip: "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent bg-muted px-2.75 font-mono text-sm leading-none font-medium whitespace-nowrap text-muted-foreground hover:text-foreground selected:border-tone-border selected:bg-tone-bg selected:text-tone-fg",
      card: "inline-flex h-7.5 items-center gap-1.75 rounded-md border border-border bg-card px-2.5 whitespace-nowrap hover:border-ring selected:border-tone-border selected:bg-tone-bg",
      toggle: cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2.5 whitespace-nowrap text-muted-foreground hover:text-foreground selected:border-tone-border selected:bg-tone-bg selected:text-tone-fg",
        textVariants({ role: "meta", weight: "medium" }),
        "leading-none",
      ),
    },
    size: {
      sm: "",
      md: "",
    },
  },
  compoundVariants: [
    {
      appearance: "segmented",
      size: "sm",
      class: cn("h-6.5 px-2.5", textVariants({ role: "meta" }), "leading-none"),
    },
  ],
  defaultVariants: {
    size: "md",
  },
})

const choiceItemClass = (appearance: ChoiceAppearance, size: ChoiceSize | undefined, className?: string): string =>
  cn(choiceItemVariants({ appearance, size }), className)

const findValue = <V extends string>(items: readonly ChoiceItem<V>[], raw: string): V | undefined =>
  items.find((item) => item.value === raw)?.value

const pickValue =
  <V extends string>(items: readonly ChoiceItem<V>[], onValueChange: (value: V) => void) =>
  (raw: string): void => {
    const value = findValue(items, raw)
    if (value === undefined) return
    onValueChange(value)
  }

const pickOrClear = <V extends string>(items: readonly ChoiceItem<V>[], onValueChange: (value: V | null) => void) => {
  const pick = pickValue(items, onValueChange)
  return (raw: string): void => {
    if (raw === NO_VALUE) {
      onValueChange(null)
      return
    }
    pick(raw)
  }
}

const selectHandler = <V extends string>(props: ChoiceGroupProps<V>): ((raw: string) => void) => {
  if (props.deselectable === true) return pickOrClear(props.items, props.onValueChange)
  return pickValue(props.items, props.onValueChange)
}

const currentOf = (selected: boolean | undefined, linkCurrent: ChoiceAnchorProps["aria-current"]): ChoiceAnchorProps["aria-current"] => {
  if (selected === undefined) return linkCurrent
  return selected ? "true" : undefined
}

export function ChoiceGroup<V extends string>(props: ChoiceGroupProps<V>) {
  const { appearance, size, tone = DEFAULT_TONE, items, label, className, value } = props
  return (
    <ToggleGroup
      type="single"
      role="radiogroup"
      aria-label={label}
      value={value ?? NO_VALUE}
      onValueChange={selectHandler(props)}
      className={cn(choiceListVariants({ appearance }), className)}
    >
      {items.map((item) => (
        <ToggleGroupItem
          key={item.value}
          value={item.value}
          disabled={item.disabled ?? false}
          data-tone={tone}
          className={choiceItemClass(appearance, size)}
        >
          {item.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function ChoiceList({ appearance, label, className, children }: ChoiceListProps) {
  return (
    <nav aria-label={label} className={cn(choiceListVariants({ appearance }), className)}>
      {children}
    </nav>
  )
}

function ChoiceAnchor({
  appearance,
  size,
  tone = DEFAULT_TONE,
  selected,
  className,
  "aria-current": linkCurrent,
  ...props
}: ChoiceAnchorProps) {
  return (
    <a
      {...props}
      data-tone={tone}
      aria-current={currentOf(selected, linkCurrent)}
      className={choiceItemClass(appearance, size, className)}
    />
  )
}

const LinkedChoiceAnchor = createLink(ChoiceAnchor)

export const ChoiceLink: LinkComponent<typeof ChoiceAnchor> = (props) => <LinkedChoiceAnchor {...props} />
