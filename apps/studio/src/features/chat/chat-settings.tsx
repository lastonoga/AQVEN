import { useEffect, useState } from "react"
import { useTranslations } from "use-intl"
import type { ApiChatBackendKind, ApiChatModelCatalog } from "@/domain"
import { ChoiceGroup, PickerCommand, PickerOption, PickerTrigger, Text } from "@/components/studio"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { PERMISSION_MODES, keptEffort, offeredEfforts, selectedModel, type ChatChoice } from "./chat-choice"

type CatalogState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly backend: ApiChatBackendKind; readonly catalog: ApiChatModelCatalog }
  | { readonly kind: "failed"; readonly backend: ApiChatBackendKind }

export type ChatSettingsProps = {
  readonly backend: ApiChatBackendKind
  readonly choice: ChatChoice
  readonly disabled: boolean
  readonly onChange: (choice: ChatChoice) => void
  readonly loadModels: (backend: ApiChatBackendKind) => Promise<ApiChatModelCatalog>
}

export function ChatSettings({ backend, choice, disabled, onChange, loadModels }: ChatSettingsProps) {
  const t = useTranslations("chat.settings")
  const modes = useTranslations("domain.chatPermissionMode")
  const [state, setState] = useState<CatalogState>({ kind: "loading" })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    void loadModels(backend)
      .then((catalog) => { if (live) setState({ kind: "ready", backend, catalog }) })
      .catch(() => { if (live) setState({ kind: "failed", backend }) })
    return () => { live = false }
  }, [backend, loadModels])

  const fresh = state.kind !== "loading" && state.backend === backend
  const catalog = fresh && state.kind === "ready" ? state.catalog : null
  const efforts = offeredEfforts(catalog, choice.model)
  const chosen = selectedModel(catalog, choice.model)
  const label = choice.model ?? t("modelDefault")

  const pickModel = (model: string | null): void => {
    setOpen(false)
    onChange({ ...choice, model, effort: keptEffort(catalog, model, choice.effort) })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <PickerTrigger aria-label={t("modelLabel")} aria-expanded={open} disabled={disabled} className="w-52">
            <Text role="item" tone={choice.model === null ? "neutral" : "default"} truncate>
              {chosen?.display_name ?? label}
            </Text>
          </PickerTrigger>
        </PopoverTrigger>
        <PopoverContent align="start" className="dark w-80 max-w-[calc(100vw-2rem)] gap-0 p-1">
          <PickerCommand>
            <CommandInput placeholder={catalog?.accepts_any_model === true ? t("modelSearchAny") : t("modelSearch")} />
            <CommandList>
              <CommandEmpty>
                {catalog?.accepts_any_model === true ? <Text role="caption" tone="neutral">{t("modelTypeAny")}</Text> : t("modelNone")}
              </CommandEmpty>
              <PickerOption value={t("modelDefault")} onSelect={() => { pickModel(null) }}>
                <Text role="item" tone="neutral">{t("modelDefault")}</Text>
              </PickerOption>
              {(catalog?.models ?? []).map((entry) => (
                <PickerOption key={entry.id} value={`${entry.id} ${entry.display_name}`} onSelect={() => { pickModel(entry.id) }}>
                  <span className="flex min-w-0 flex-col">
                    <Text role="item" weight="semibold" truncate>{entry.display_name}</Text>
                    {entry.description === null ? null : <Text role="tiny" tone="neutral" truncate>{entry.description}</Text>}
                  </span>
                  {entry.is_default ? <Text role="tiny" tone="neutral" className="ml-auto">{t("modelIsDefault")}</Text> : null}
                </PickerOption>
              ))}
            </CommandList>
          </PickerCommand>
          {catalog?.detail == null ? null : <Text as="p" role="tiny" tone="neutral" className="px-3 py-2">{catalog.detail}</Text>}
        </PopoverContent>
      </Popover>

      {efforts.length === 0 ? null : (
        <ChoiceGroup
          appearance="segmented"
          label={t("effortLabel")}
          deselectable
          value={choice.effort}
          onValueChange={(value) => { onChange({ ...choice, effort: value }) }}
          items={efforts.map((effort) => ({ value: effort, disabled, label: t(`effort.${effort}`) }))}
        />
      )}

      <ChoiceGroup
        appearance="segmented"
        label={t("permissionLabel")}
        value={choice.permissionMode}
        onValueChange={(value) => { onChange({ ...choice, permissionMode: value }) }}
        items={PERMISSION_MODES.map((mode) => ({ value: mode, disabled, label: modes(mode) }))}
      />

      {fresh && state.kind === "failed" ? <Text role="tiny" tone="neutral">{t("modelsUnavailable")}</Text> : null}
    </div>
  )
}
