import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight } from "lucide-react"
import { useTranslations } from "use-intl"
import type { AuthoringDataset, CaseSelectionDraft, FlowId, TagOptions } from "@/domain"
import { ChoiceGroup, PickerCommand, PickerCount, PickerOption, PickerTrigger, Text, type ChoiceItem } from "@/components/studio"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ROUTE_PATH } from "@/lib/routes"
import { casesSearch } from "../presenters"
import { SplitBar } from "../split-bar"
import { findDataset, strayTags, withDataset, withTag } from "./model"
import { useCaseCount, type CaseCountState } from "./use-case-count"

export type CasesPickerProps = {
  readonly datasets: readonly AuthoringDataset[]
  readonly value: CaseSelectionDraft | null
  readonly onChange: (next: CaseSelectionDraft) => void
  readonly casesFlow: FlowId | null
  readonly disabled?: boolean
}

type TagToken = "any" | `value:${string}`

const ANY: TagToken = "any"

const tokenOf = (value: string): TagToken => `value:${value}`

const VALUE_PREFIX = "value:"

const valueOf = (token: TagToken | null): string | null => (token === null || token === ANY ? null : token.slice(VALUE_PREFIX.length))

function DatasetOption({ dataset, checked, onChoose }: { readonly dataset: AuthoringDataset; readonly checked: boolean; readonly onChoose: () => void }) {
  const t = useTranslations("authoring.picker")
  return (
    <PickerOption value={dataset.id} onSelect={onChoose} data-checked={checked} aria-current={checked ? "true" : undefined} className="min-h-12 py-2">
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono font-medium">{dataset.id}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{t("cases", { count: dataset.total })}</span>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">{dataset.flow === null ? t("noFlow") : t("forFlow", { flow: dataset.flow })}</span>
      </span>
    </PickerOption>
  )
}

type DatasetChooserProps = {
  readonly datasets: readonly AuthoringDataset[]
  readonly current: AuthoringDataset | null
  readonly value: CaseSelectionDraft | null
  readonly onChange: (next: CaseSelectionDraft) => void
  readonly disabled: boolean
}

function DatasetChooser({ datasets, current, value, onChange, disabled }: DatasetChooserProps) {
  const t = useTranslations("authoring.picker")
  const [open, setOpen] = useState(false)
  const choose = (dataset: AuthoringDataset): void => {
    setOpen(false)
    if (dataset.id === value?.dataset) return
    onChange(withDataset(dataset.id))
  }
  const shown = value?.dataset ?? null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          disabled={disabled}
          aria-expanded={open}
          aria-label={shown === null ? t("chooseDataset") : t("datasetAria", { dataset: shown, cases: t("cases", { count: current?.total ?? 0 }) })}
          className="w-full max-w-md"
        >
          <Text role="item" weight="semibold" truncate className="min-w-0 font-mono">
            {shown ?? t("chooseDataset")}
          </Text>
          {current === null ? null : (
            <Text role="tiny" tone="neutral" className="shrink-0">
              {t("cases", { count: current.total })}
            </Text>
          )}
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-96 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand label={t("search")}>
          <CommandInput aria-label={t("search")} placeholder={t("searchPlaceholder")} />
          <PickerCount>{t("inProject", { count: datasets.length })}</PickerCount>
          <CommandList label={t("listAria")}>
            <CommandEmpty>{t("noMatches")}</CommandEmpty>
            {datasets.map((dataset) => (
              <DatasetOption
                key={dataset.id}
                dataset={dataset}
                checked={dataset.id === value?.dataset}
                onChoose={() => {
                  choose(dataset)
                }}
              />
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  )
}

type TagRowProps = {
  readonly options: TagOptions
  readonly value: string | null
  readonly onPick: (value: string | null) => void
  readonly disabled: boolean
}

function TagRow({ options, value, onPick, disabled }: TagRowProps) {
  const t = useTranslations("authoring.picker")
  const items: readonly ChoiceItem<TagToken>[] = [
    { value: ANY, label: t("any"), disabled },
    ...options.values.map((item) => ({ value: tokenOf(item.value), label: t("valueCount", { value: item.value, count: item.count }), disabled })),
  ]
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <Text role="cell" tone="default" weight="semibold">
        {options.tag}
      </Text>
      <ChoiceGroup
        appearance="chip"
        size="sm"
        tone="primary"
        label={t("tagAria", { tag: options.tag })}
        items={items}
        value={value === null ? ANY : tokenOf(value)}
        onValueChange={(token) => {
          onPick(valueOf(token))
        }}
        className="flex-wrap overflow-visible"
      />
    </li>
  )
}

function UnknownTags({ value, dataset }: { readonly value: CaseSelectionDraft; readonly dataset: AuthoringDataset }) {
  const t = useTranslations("authoring.picker")
  const unknown = strayTags(value, dataset)
  if (unknown.length === 0) return null
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {unknown.map(([tag, tagValue]) => (
        <li key={tag}>
          <Text role="hint" tone="warning">
            {t("unknownTag", { tag, value: tagValue })}
          </Text>
        </li>
      ))}
    </ul>
  )
}

type TagsBlockProps = {
  readonly dataset: AuthoringDataset
  readonly value: CaseSelectionDraft
  readonly onChange: (next: CaseSelectionDraft) => void
  readonly disabled: boolean
}

function TagsBlock({ dataset, value, onChange, disabled }: TagsBlockProps) {
  const t = useTranslations("authoring.picker")
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Text role="label" tone="neutral">
        {t("tags")}
      </Text>
      {dataset.tags.length === 0 ? (
        <Text as="p" role="hint" tone="neutral">
          {t("noTags")}
        </Text>
      ) : (
        <>
          <Text as="p" role="hint" tone="neutral">
            {t("tagsHint")}
          </Text>
          <ul className="flex min-w-0 flex-col gap-3">
            {dataset.tags.map((options) => (
              <TagRow
                key={options.tag}
                options={options}
                value={value.tags[options.tag] ?? null}
                disabled={disabled}
                onPick={(tagValue) => {
                  onChange(withTag(value, options.tag, tagValue))
                }}
              />
            ))}
          </ul>
        </>
      )}
      <UnknownTags value={value} dataset={dataset} />
    </div>
  )
}

function CountBody({ state }: { readonly state: CaseCountState }) {
  const t = useTranslations("authoring.picker")
  if (state.kind === "idle") return null
  if (state.kind === "failed") {
    return (
      <Text role="hint" tone="destructive">
        {t("countFailed", { reason: state.message })}
      </Text>
    )
  }
  const count = state.kind === "ready" ? state.count : state.previous
  return (
    <div className="flex min-w-0 flex-col gap-1.5" aria-busy={state.kind === "loading"}>
      <Text role="item" tone="default" weight="semibold" aria-live="polite">
        {count === null ? t("counting") : t("count", { selected: count.selected, total: count.total })}
      </Text>
      {count === null ? null : <SplitBar splits={count.splits} />}
    </div>
  )
}

function CasesLink({ value, flow }: { readonly value: CaseSelectionDraft; readonly flow: FlowId | null }) {
  const t = useTranslations("authoring.picker")
  if (flow === null) return null
  return (
    <Text role="link" tone="neutral" asChild>
      <Link
        to={ROUTE_PATH.cases}
        params={{ flowId: flow }}
        search={casesSearch(value.dataset, value.tags)}
        className="inline-flex items-center gap-1 self-start"
      >
        {t("openCases")}
        <ArrowUpRight aria-hidden className="size-3" />
      </Link>
    </Text>
  )
}

export function CasesPicker({ datasets, value, onChange, casesFlow, disabled = false }: CasesPickerProps) {
  const t = useTranslations("authoring.picker")
  const current = value === null ? null : findDataset(datasets, value.dataset)
  const count = useCaseCount(value, datasets)
  if (datasets.length === 0 && value === null) {
    return (
      <Text as="p" role="hint" tone="neutral">
        {t("noDatasets")}
      </Text>
    )
  }
  return (
    <div role="group" aria-label={t("aria")} className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <Text role="label" tone="neutral">
          {t("dataset")}
        </Text>
        <DatasetChooser datasets={datasets} current={current} value={value} onChange={onChange} disabled={disabled} />
      </div>
      {value === null || current === null ? null : <TagsBlock dataset={current} value={value} onChange={onChange} disabled={disabled} />}
      {value === null ? null : (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Text role="label" tone="neutral">
            {t("selected")}
          </Text>
          <CountBody state={count} />
          <CasesLink value={value} flow={current?.flow ?? casesFlow} />
        </div>
      )}
    </div>
  )
}
