import { Link } from "@tanstack/react-router"
import { PanelTop, SlidersHorizontal, type LucideIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import { Text, type TextTone, type TextWeight } from "@/components/studio"
import { DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { ROUTE_PATH } from "@/lib/routes"

type ActionInk = { readonly tone: TextTone; readonly weight: TextWeight }
type Command = { readonly id: "project"; readonly icon: LucideIcon; readonly to: typeof ROUTE_PATH.project }

const INK: ActionInk = { tone: "neutral", weight: "normal" }
const ACTION_ITEM = "gap-2 px-2.25 py-1.5"

const COMMANDS: readonly Command[] = [
  { id: "project", icon: PanelTop, to: ROUTE_PATH.project },
]

export function PickerActions({ onNavigate, onOpenSettings }: { readonly onNavigate: () => void; readonly onOpenSettings: () => void }) {
  const t = useTranslations("shell.picker")
  return (
    <DropdownMenuGroup className="flex flex-col gap-px">
      {COMMANDS.map((command) => (
        <DropdownMenuItem key={command.id} asChild className={ACTION_ITEM}>
          <Link to={command.to} onClick={onNavigate}>
            <Text role="meta" {...INK} asChild>
              <command.icon className="size-3.5" />
            </Text>
            <Text role="meta" {...INK}>
              {t(command.id)}
            </Text>
          </Link>
        </DropdownMenuItem>
      ))}
      <DropdownMenuItem asChild className={ACTION_ITEM}>
        <button type="button" className="w-full text-left" onClick={() => { onNavigate(); onOpenSettings() }}>
          <Text role="meta" {...INK} asChild>
            <SlidersHorizontal className="size-3.5" />
          </Text>
          <Text role="meta" {...INK}>
            {t("studioSettings")}
          </Text>
        </button>
      </DropdownMenuItem>
    </DropdownMenuGroup>
  )
}
