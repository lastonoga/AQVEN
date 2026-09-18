import type { ComponentProps } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Command, CommandItem } from "@/components/ui/command"
import { Text } from "./text"

type PickerTriggerProps = Omit<ComponentProps<typeof Button>, "size" | "variant" | "role"> & {
  readonly children: React.ReactNode
}

export function PickerTrigger({ children, className, ...props }: PickerTriggerProps) {
  return (
    <Button variant="outline" size="sm" role="combobox" className={`w-64 min-w-0 justify-start ${className ?? ""}`} {...props}>
      {children}
      <ChevronDown aria-hidden className="ml-auto size-3 shrink-0" />
    </Button>
  )
}

export function PickerCount({ children }: { readonly children: React.ReactNode }) {
  return <Text as="p" role="caption" tone="neutral" className="px-3 py-2">{children}</Text>
}

export function PickerCommand(props: Omit<ComponentProps<typeof Command>, "defaultValue" | "value">) {
  return <Command defaultValue="__aqven_picker_idle__" {...props} />
}

export function PickerOption({ className, ...props }: ComponentProps<typeof CommandItem>) {
  return (
    <CommandItem
      className={cn(
        "cursor-pointer rounded-md px-3 data-selected:bg-[color-mix(in_oklab,var(--popover)_80%,var(--foreground))] data-[checked=true]:bg-[color-mix(in_oklab,var(--popover)_70%,var(--foreground))] data-[checked=true]:data-selected:bg-[color-mix(in_oklab,var(--popover)_70%,var(--foreground))]",
        className,
      )}
      {...props}
    />
  )
}
