import { useRef, useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiProject } from "@/domain"
import { Surface, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PICKER_TARGETS, type PickerTargets } from "./flow-items"
import { projectName } from "./presenters"
import type { FlowScope } from "./selected-flow"

const MENU_OFFSET = 4

export type FlowPickerProps = {
  readonly project: ApiProject
  readonly flows: readonly ApiFlow[]
  readonly selected: FlowScope
  readonly targets: PickerTargets
}

function Caret({ open }: { readonly open: boolean }) {
  const Icon = open ? ChevronUp : ChevronDown
  return (
    <Text role="hint" tone="neutral" asChild>
      <Icon className="size-3 shrink-0" />
    </Text>
  )
}

export function FlowPicker({ project, flows, selected, targets }: FlowPickerProps) {
  const t = useTranslations("shell.picker")
  const [open, setOpen] = useState(false)
  const navigated = useRef(false)
  const Targets = PICKER_TARGETS[targets]
  const close = () => {
    navigated.current = true
    setOpen(false)
  }
  const skipFocusAfterNavigation = (event: Event): void => {
    if (!navigated.current) return
    navigated.current = false
    event.preventDefault()
  }
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t("triggerAria")} className="min-w-0 max-w-64 shrink gap-1 px-2 text-foreground">
          <Text role="item" weight="semibold" tone="default" truncate>
            {selected ?? t("all")}
          </Text>
          <Caret open={open} />
        </Button>
      </DropdownMenuTrigger>
      <Surface variant="popover" asChild className="dark p-1.5">
        <DropdownMenuContent
          align="start"
          sideOffset={MENU_OFFSET}
          className="w-72 min-w-(--radix-dropdown-menu-trigger-width)"
          onCloseAutoFocus={skipFocusAfterNavigation}
        >
          <DropdownMenuLabel className="px-2.25 pt-1.75 pb-2">
            <Text as="div" role="menu" weight="medium" tone="neutral">
              {t("label", { project: projectName(project) })}
            </Text>
          </DropdownMenuLabel>
          <Targets flows={flows} selected={selected} onNavigate={close} />
        </DropdownMenuContent>
      </Surface>
    </DropdownMenu>
  )
}
