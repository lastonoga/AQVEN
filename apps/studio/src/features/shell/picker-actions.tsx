import { SlidersHorizontal } from "lucide-react"
import { useTranslations } from "use-intl"
import { Text, type TextTone, type TextWeight } from "@/components/studio"
import { DropdownMenuGroup, DropdownMenuItem } from "@/components/ui/dropdown-menu"

type ActionInk = { readonly tone: TextTone; readonly weight: TextWeight }

const INK: ActionInk = { tone: "neutral", weight: "normal" }
const ACTION_ITEM = "gap-2 px-2.25 py-1.5"

export function PickerActions({ onNavigate, onOpenSettings }: { readonly onNavigate: () => void; readonly onOpenSettings: () => void }) {
  const t = useTranslations("shell.picker")
  return (
    <DropdownMenuGroup className="flex flex-col gap-px">
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
