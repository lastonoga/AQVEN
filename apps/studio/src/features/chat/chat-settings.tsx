import { useEffect, useState, type Dispatch, type SetStateAction } from "react"
import { Check, FileCode, Hand, Map as MapIcon, Zap } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiChatBackendKind, ApiChatModelCatalog, ApiChatSession, ApiChatSessionSettings } from "@/domain"
import { PickerCommand, PickerOption, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { PERMISSION_MODES, catalogDefault, keptEffort, offeredEfforts, selectedModel, type ChatChoice } from "./chat-choice"
import { useChatChoice } from "./chat-choice-context"

type CatalogState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly backend: ApiChatBackendKind; readonly catalog: ApiChatModelCatalog }
  | { readonly kind: "failed"; readonly backend: ApiChatBackendKind }

const MODE_ICONS = { default: Hand, accept_edits: FileCode, plan: MapIcon, trust: Zap } as const

export type ChatSettingsProps = {
  readonly backend: ApiChatBackendKind
  readonly session: ApiChatSession | null
  readonly applyToSession: (settings: ApiChatSessionSettings) => void
  readonly choice: ChatChoice
  readonly disabled: boolean
  readonly onChange: Dispatch<SetStateAction<ChatChoice>>
  readonly loadModels: (backend: ApiChatBackendKind) => Promise<ApiChatModelCatalog>
}

function Row({ selected, children, onSelect, value }: {
  readonly selected: boolean
  readonly children: React.ReactNode
  readonly onSelect: () => void
  readonly value: string
}) {
  return (
    <PickerOption value={value} onSelect={onSelect} className="items-start gap-3 py-2">
      {children}
      {selected ? <Check aria-hidden className="ml-auto size-4 shrink-0 self-center" /> : null}
    </PickerOption>
  )
}

export function ChatSettings({ backend, session, applyToSession, choice, disabled, onChange, loadModels }: ChatSettingsProps) {
  const t = useTranslations("chat.settings")
  const modes = useTranslations("domain.chatPermissionMode")
  const [state, setState] = useState<CatalogState>({ kind: "loading" })
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    void loadModels(backend)
      .then((catalog) => {
        if (!live) return
        setState({ kind: "ready", backend, catalog })
        if (session === null) onChange((previous) => catalogDefault(catalog, previous) ?? previous)
      })
      .catch(() => { if (live) setState({ kind: "failed", backend }) })
    return () => { live = false }
  }, [backend, loadModels, onChange, session])

  const fresh = state.kind !== "loading" && state.backend === backend
  const current: ChatChoice = session === null
    ? choice
    : { model: session.model, effort: session.effort ?? null, permissionMode: session.permission_mode }
  const catalog = fresh && state.kind === "ready" ? state.catalog : null
  const efforts = offeredEfforts(catalog, current.model)
  const shownModel = current.model
  const shownEffort = current.effort
  const chosen = selectedModel(catalog, shownModel)
  const modelLabel = chosen?.display_name ?? shownModel ?? t("modelAgentDefault")
  const effortIndex = current.effort === null ? -1 : efforts.indexOf(current.effort)
  const shownEffortLabel = shownEffort === null ? null : t(`effort.${shownEffort}`)

  const settle = (next: ChatChoice): void => {
    if (session === null) {
      onChange(next)
      return
    }
    applyToSession({ model: next.model, effort: next.effort, permission_mode: next.permissionMode })
  }

  const pickModel = (model: string | null): void => {
    settle({ ...current, model, effort: keptEffort(catalog, model, current.effort) })
  }

  const slide = (position: number): void => {
    const next = efforts[position]
    if (next !== undefined) settle({ ...current, effort: next })
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label={t("menuAria")}
          disabled={disabled}
          className="min-w-0 max-w-64 gap-1.5 px-2"
        >
          <Text role="hint" truncate>{modelLabel}</Text>
          {shownEffortLabel === null ? null : <Text role="hint" tone="neutral" truncate>{shownEffortLabel}</Text>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="dark w-[21rem] max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand>
          <CommandList className="max-h-[26rem]">
            <Text as="p" role="caption" tone="neutral" className="px-3 pt-2 pb-1">
              {t("modelLabel")}
            </Text>
            {(catalog?.models ?? []).map((entry) => (
              <Row key={entry.id} value={entry.id} selected={current.model === entry.id} onSelect={() => { pickModel(entry.id) }}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <Text role="meta" weight="semibold">{entry.display_name}</Text>
                  {entry.description === null ? null : <Text role="hint" tone="neutral">{entry.description}</Text>}
                </span>
              </Row>
            ))}

            <Text as="p" role="caption" tone="neutral" className="px-3 pt-3 pb-1">{t("permissionLabel")}</Text>
            {PERMISSION_MODES.map((mode) => {
              const Icon = MODE_ICONS[mode]
              return (
                <Row key={mode} value={mode} selected={current.permissionMode === mode} onSelect={() => { settle({ ...current, permissionMode: mode }) }}>
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <Text role="meta" weight="semibold">{modes(mode)}</Text>
                    <Text role="hint" tone="neutral">{modes(`${mode}Detail`)}</Text>
                  </span>
                </Row>
              )
            })}
          </CommandList>
        </PickerCommand>

        {efforts.length === 0 ? null : (
          <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
            <span className="flex items-baseline gap-2">
              <Text role="meta" weight="semibold">{t("effortLabel")}</Text>
              <Text role="hint" tone="neutral" truncate>{shownEffortLabel ?? t("effortAuto")}</Text>
            </span>
            <Slider
              aria-label={t("effortLabel")}
              className="w-full"
              min={0}
              max={efforts.length - 1}
              step={1}
              value={[effortIndex < 0 ? 0 : effortIndex]}
              onValueChange={(next: readonly number[]) => { slide(next[0] ?? 0) }}
              disabled={disabled}
            />
          </div>
        )}
        {catalog?.detail == null ? null : <Text as="p" role="caption" tone="neutral" className="px-3 pb-2">{catalog.detail}</Text>}
        {fresh && state.kind === "failed" ? <Text as="p" role="caption" tone="neutral" className="px-3 pb-2">{t("modelsUnavailable")}</Text> : null}
      </PopoverContent>
    </Popover>
  )
}

export function ComposerChatSettings() {
  const control = useChatChoice()
  if (control === null) return null
  return (
    <ChatSettings
      backend={control.backend}
      session={control.session}
      applyToSession={control.applyToSession}
      choice={control.choice}
      disabled={control.disabled}
      onChange={control.onChange}
      loadModels={control.loadModels}
    />
  )
}
