import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiFlow, ApiFlowDetail, ApiProject } from "@/domain"
import { Surface, Tag, Text, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { flowId as toFlowId } from "@/data/ids"
import { PickerActions } from "./picker-actions"
import { FlowItems } from "./flow-items"
import { projectInitial, projectName } from "./presenters"

const MENU_OFFSET = 4
const PATH_SLASH = "/"

export type FlowPickerProps = {
  readonly project: ApiProject
  readonly flows: readonly ApiFlow[]
  readonly flow: ApiFlowDetail
  readonly onOpenSettings: () => void
}

function Caret({ open }: { readonly open: boolean }) {
  const Icon = open ? ChevronUp : ChevronDown
  return (
    <Text role="hint" tone="neutral" asChild>
      <Icon className="size-3 shrink-0" />
    </Text>
  )
}

export function FlowPicker({ project, flows, flow, onOpenSettings }: FlowPickerProps) {
  const t = useTranslations("shell.picker")
  const [open, setOpen] = useState(false)
  const close = () => {
    setOpen(false)
  }
  return (
    <Toolbar size="lg" className="mt-2.25 shrink-0 px-3">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="md" aria-label={t("triggerAria")} className="w-full min-w-0 justify-start">
            <Tag fill="solid" tone="primary" shape="square" size="sm">
              {projectInitial(project)}
            </Tag>
            <Text role="hint" weight="normal" tone="neutral" className="shrink-0">
              {projectName(project)}
            </Text>
            <Text role="hint" tone="faint" className="shrink-0">
              {PATH_SLASH}
            </Text>
            <Text role="item" weight="semibold" tone="default" truncate>
              {flow.flow_id}
            </Text>
            <span className="ml-auto flex items-center">
              <Caret open={open} />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <Surface variant="popover" asChild className="dark p-1.5">
          <DropdownMenuContent align="start" sideOffset={MENU_OFFSET} className="w-(--radix-dropdown-menu-trigger-width)">
            <DropdownMenuLabel className="px-2.25 pt-1.75 pb-2">
              <Text as="div" role="menu" weight="medium" tone="neutral">
                {t("label", { project: projectName(project) })}
              </Text>
            </DropdownMenuLabel>
            <FlowItems flows={flows} currentId={toFlowId(flow.flow_id)} onNavigate={close} />
            <DropdownMenuSeparator className="mx-0 my-1.25" />
            <PickerActions onNavigate={close} onOpenSettings={onOpenSettings} />
          </DropdownMenuContent>
        </Surface>
      </DropdownMenu>
    </Toolbar>
  )
}
