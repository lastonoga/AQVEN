import type { ComponentProps, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"

type ButtonProps = ComponentProps<typeof Button>

export type ActionSpec = {
  readonly id: string
  readonly label: ReactNode
  readonly variant?: ButtonProps["variant"]
  readonly icon?: LucideIcon
  readonly filledIcon?: boolean
  readonly disabled?: boolean
  readonly onClick?: () => void
}

export type ActionsProps = { readonly actions: readonly ActionSpec[]; readonly size?: ButtonProps["size"] }

function ActionIcon({ icon: Icon, filled }: { readonly icon: LucideIcon | undefined; readonly filled: boolean }) {
  if (Icon === undefined) return null
  return <Icon aria-hidden fill={filled ? "currentColor" : "none"} />
}

export function Actions({ actions, size = "sm" }: ActionsProps) {
  return actions.map((action) => (
    <Button
      key={action.id}
      variant={action.variant ?? "outline"}
      size={size}
      disabled={action.disabled ?? false}
      onClick={action.onClick ?? noop}
    >
      <ActionIcon icon={action.icon} filled={action.filledIcon ?? false} />
      {action.label}
    </Button>
  ))
}
