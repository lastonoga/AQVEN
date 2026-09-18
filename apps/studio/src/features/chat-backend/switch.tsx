import { useTranslations } from "use-intl"
import { ChoiceGroup } from "@/components/studio"
import { Spinner } from "@/components/ui/spinner"
import { useChatBackend } from "./context"

export function ChatBackendSwitch({ className }: { readonly className?: string }) {
  const t = useTranslations("setup.agent")
  const { backend, pending, error, select, retry } = useChatBackend()
  const items = (["claude", "codex"] as const).map((value) => ({
    value,
    disabled: pending !== null || backend === null,
    label: <span className="inline-flex items-center gap-1.5">{pending === value ? <Spinner aria-hidden="true" className="size-3" /> : null}{t(`names.${value}`)}</span>,
  }))
  return (
    <div className={className}>
      <ChoiceGroup
        appearance="segmented"
        label={t("selectBackend")}
        items={items}
        deselectable
        value={backend}
        onValueChange={(chosen) => { if (chosen !== null) void select(chosen) }}
      />
      {backend === null && error === null ? <p role="status" className="mt-2 text-xs text-muted-foreground">{t("loading")}</p> : null}
      {pending === null ? null : <p role="status" className="mt-2 text-xs text-muted-foreground">{t("switching")}</p>}
      {error === null ? null : (
        <div role="alert" className="mt-2 flex items-center gap-2 text-xs text-destructive">
          <span>{error}</span>
          {backend === null ? <button type="button" className="underline" onClick={retry}>{t("retry")}</button> : null}
        </div>
      )}
    </div>
  )
}
