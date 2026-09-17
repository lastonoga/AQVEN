import { Link } from "@tanstack/react-router"
import { PanelTop, Plus, Settings, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import { Text, type TextTone, type TextWeight } from "@/components/studio"
import { DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { noop } from "@/lib/noop"
import { ROUTE_PATH, shellRouteApi } from "@/lib/routes"
import { MODE_ROUTE } from "./navigation"

type ActionInk = { readonly tone: TextTone; readonly weight: TextWeight }
type Command = { readonly id: "newWorkflow" | "allWorkflows"; readonly icon: LucideIcon; readonly ink: ActionInk }

const PRIMARY: ActionInk = { tone: "default", weight: "medium" }
const SECONDARY: ActionInk = { tone: "neutral", weight: "normal" }
const ACTION_ITEM = "gap-2 px-2.25 py-1.5"

const COMMANDS: readonly Command[] = [
  { id: "newWorkflow", icon: Plus, ink: PRIMARY },
  { id: "allWorkflows", icon: PanelTop, ink: SECONDARY },
]

type ActionLabelProps = { readonly icon: LucideIcon; readonly ink: ActionInk; readonly label: string }

function ActionLabel({ icon: Icon, ink, label }: ActionLabelProps) {
  return (
    <>
      <Text role="meta" {...ink} asChild>
        <Icon className="size-3.5" />
      </Text>
      <Text role="meta" {...ink}>
        {label}
      </Text>
    </>
  )
}

export function PickerActions({ onNavigate }: { readonly onNavigate: () => void }) {
  const t = useTranslations("shell.picker")
  const params = shellRouteApi.useParams()
  return (
    <DropdownMenuGroup className="flex flex-col gap-px">
      {COMMANDS.map((command) => (
        <DropdownMenuItem key={command.id} onSelect={noop} className={ACTION_ITEM}>
          <ActionLabel icon={command.icon} ink={command.ink} label={t(command.id)} />
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem asChild className={ACTION_ITEM}>
        <Link to={MODE_ROUTE.nodes} params={params} onClick={onNavigate}>
          <ActionLabel icon={Settings} ink={SECONDARY} label={t("settings")} />
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={ACTION_ITEM}>
        <Link to={ROUTE_PATH.settings} params={{ locale: params.locale }} onClick={onNavigate}>
          <ActionLabel icon={SlidersHorizontal} ink={SECONDARY} label={t("studioSettings")} />
        </Link>
      </DropdownMenuItem>
    </DropdownMenuGroup>
  )
}
