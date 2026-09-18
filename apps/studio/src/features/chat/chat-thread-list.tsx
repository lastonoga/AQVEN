import { Check, ChevronDown, Plus } from "lucide-react"
import { useLocale, useTranslations } from "use-intl"
import type { ApiChatSession } from "@/domain"
import { Surface } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type ChatThreadListProps = {
  readonly sessions: readonly ApiChatSession[]
  readonly activeId: string | null
  readonly creating: boolean
  readonly onSelect: (session: ApiChatSession) => void
  readonly onCreate: () => void
}

export function ChatThreadList({ sessions, activeId, creating, onSelect, onCreate }: ChatThreadListProps) {
  const t = useTranslations("chat.threads")
  const agents = useTranslations("setup.agent")
  const locale = useLocale()
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
  const label = (session: ApiChatSession): string => `${agents(`names.${session.backend}`)} · ${session.flow_id ?? t("project")}`
  const active = sessions.find((session) => session.session_id === activeId)

  return (
    <div className="shrink-0 border-b border-border px-3.5 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={t("triggerAria")} className="w-full min-w-0 justify-start border border-border/70 bg-card/40 text-xs font-normal hover:border-border hover:bg-muted">
            <span className="min-w-0 truncate text-foreground">{active === undefined ? t("select") : label(active)}</span>
            {active === undefined ? null : <time dateTime={active.created_at} className="ml-auto shrink-0 text-[10px] text-muted-foreground">{formatter.format(new Date(active.created_at))}</time>}
            <ChevronDown className="ml-1 size-3 shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <Surface variant="popover" asChild className="dark p-1.5">
          <DropdownMenuContent align="start" className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-(--radix-dropdown-menu-trigger-width) overflow-y-auto">
            <DropdownMenuItem disabled={creating} onSelect={onCreate} className="gap-2 px-2 py-1.5">
              <Plus className="size-3.5" />
              {t("new")}
            </DropdownMenuItem>
            {sessions.length === 0 ? null : <DropdownMenuSeparator />}
            {sessions.map((session) => {
              const started = formatter.format(new Date(session.created_at))
              const current = session.session_id === activeId
              return (
                <DropdownMenuItem
                  key={session.session_id}
                  aria-label={`${label(session)} · ${started} · ${session.session_id.slice(-6)}`}
                  aria-current={current ? "true" : undefined}
                  selected={current}
                  onSelect={() => { onSelect(session) }}
                  className="min-w-0 gap-2 px-2 py-1.5"
                >
                  <span className="min-w-0 flex-1 truncate">{label(session)}</span>
                  <time dateTime={session.created_at} className="shrink-0 text-[10px] text-muted-foreground">{started}</time>
                  {current ? <Check className="size-3.5" /> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </Surface>
      </DropdownMenu>
    </div>
  )
}
