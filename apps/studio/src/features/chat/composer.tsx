import type { ComponentProps } from "react"
import { AuiIf, ComposerPrimitive, type AssistantState } from "@assistant-ui/react"
import { cn } from "cn"
import { ArrowUp, Mic, MicOff, Plus, Square, type LucideIcon } from "lucide-react"
import { useTranslations } from "use-intl"
import { Surface, textVariants } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { noop } from "@/lib/noop"
import { ComposerChatSettings } from "./chat-settings"
import { Hint } from "./hint"

type ComposerLabel = "sendAria" | "cancelAria" | "dictateAria" | "stopDictationAria"

type ComposerAction = {
  readonly label: ComposerLabel
  readonly condition: (state: AssistantState) => boolean
  readonly Primitive: typeof ComposerPrimitive.Send
  readonly Icon: LucideIcon
  readonly look: Pick<ComponentProps<typeof Button>, "variant" | "size">
}

const ICON = "size-3.75"

const INPUT_CLASS = cn(
  textVariants({ role: "prose", tone: "default" }),
  "block min-h-8.5 w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground",
)

const isDictating = (state: AssistantState): boolean => state.composer.dictation !== undefined

const canDictate = (state: AssistantState): boolean => state.thread.capabilities.dictation && !isDictating(state)

const DICTATION_ACTIONS: readonly ComposerAction[] = [
  { label: "dictateAria", condition: canDictate, Primitive: ComposerPrimitive.Dictate, Icon: Mic, look: { variant: "ghost", size: "icon-sm" } },
  { label: "stopDictationAria", condition: isDictating, Primitive: ComposerPrimitive.StopDictation, Icon: MicOff, look: { variant: "destructive", size: "icon-sm" } },
]

const always = (): boolean => true

const SUBMIT_ACTIONS: readonly ComposerAction[] = [
  { label: "cancelAria", condition: (state) => state.thread.isRunning, Primitive: ComposerPrimitive.Cancel, Icon: Square, look: { variant: "outline", size: "icon-round" } },
  { label: "sendAria", condition: always, Primitive: ComposerPrimitive.Send, Icon: ArrowUp, look: { size: "icon-round" } },
]

function ComposerActions({ actions }: { readonly actions: readonly ComposerAction[] }) {
  const t = useTranslations("chat.composer")
  return actions.map(({ label, condition, Primitive, Icon, look }) => (
    <AuiIf key={label} condition={condition}>
      <Hint label={t(label)}>
        <Primitive asChild>
          <Button {...look} aria-label={t(label)}>
            <Icon aria-hidden className={ICON} />
          </Button>
        </Primitive>
      </Hint>
    </AuiIf>
  ))
}

export function Composer() {
  const t = useTranslations("chat.composer")
  return (
    <div className="flex-none px-3.5 pt-2 pb-3.5">
      <Surface variant="raised" padding="sm" asChild>
        <ComposerPrimitive.Root>
          <ComposerPrimitive.Input submitMode="enter" rows={1} placeholder={t("placeholder")} className={INPUT_CLASS} />
          <div className="flex items-center gap-1.5">
            <Hint label={t("addAria")}>
              <Button variant="ghost" size="icon-sm" aria-label={t("addAria")} onClick={noop}>
                <Plus aria-hidden className={ICON} />
              </Button>
            </Hint>
            <ComposerChatSettings />
            <ComposerActions actions={DICTATION_ACTIONS} />
            <div className="flex-1" />
            <ComposerActions actions={SUBMIT_ACTIONS} />
          </div>
        </ComposerPrimitive.Root>
      </Surface>
    </div>
  )
}
