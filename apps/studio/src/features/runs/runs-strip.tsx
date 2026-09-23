import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useNow, useTranslations } from "use-intl"
import type { ApiRun, RunId } from "@/domain"
import { Dot, Empty, PickerCommand, PickerCount, PickerOption, PickerTrigger, Tag, Text } from "@/components/studio"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useRelativeTime } from "@/i18n/format"
import { ROUTE_PATH, runsRouteApi } from "@/lib/routes"
import { runRows, type RunRow } from "./presenters"

export type RunsStripProps = { readonly runs: readonly ApiRun[]; readonly selected: RunId | null }

const VISIBLE_NODE_LIMIT = 3

const datasetParts = (itemId: string | null | undefined): { readonly dataset: string | null; readonly caseName: string | null } => {
  if (!itemId) return { dataset: null, caseName: null }
  const separator = itemId.indexOf("/")
  if (separator <= 0 || separator === itemId.length - 1) return { dataset: itemId, caseName: null }
  return { dataset: itemId.slice(0, separator), caseName: itemId.slice(separator + 1) }
}

export function RunOption({ row, onSelect }: { readonly row: RunRow; readonly onSelect: (id: RunId) => void }) {
  const t = useTranslations("runs")
  const status = useTranslations("domain.runStatus")
  const mode = useTranslations("domain.runMode")
  const relative = useRelativeTime("narrow")
  const { dataset, caseName } = datasetParts(row.run.dataset_item_id)
  const nodes = row.run.selected_nodes ?? []
  const scope = row.run.start_node != null && row.run.end_node != null
    ? t("dataset.rangeScope", { start: row.run.start_node, end: row.run.end_node })
    : nodes.length ? nodes.join(", ") : t("dataset.wholeFlow")
  const hiddenNodes = Math.max(0, nodes.length - VISIBLE_NODE_LIMIT)
  const visibleScope = nodes.length === 0 ? scope : `${nodes.slice(0, VISIBLE_NODE_LIMIT).join(", ")}${hiddenNodes === 0 ? "" : ` +${String(hiddenNodes)}`}`
  const supportingTone = row.selected ? "default" : "neutral"
  return (
    <PickerOption
      value={`${row.ref} ${row.id} ${status(row.run.status)} ${mode(row.run.mode)} ${row.run.dataset_item_id ?? ""} ${scope}`}
      title={`${t("pickerDataset")}: ${dataset ?? t("pickerNoDataset")}${caseName === null ? "" : ` · ${t("pickerCase")}: ${caseName}`} · ${t("pickerScope")}: ${scope}`}
      onSelect={() => { onSelect(row.id) }}
      data-checked={row.selected}
      aria-current={row.selected ? "true" : undefined}
      className="min-h-20 gap-2 py-2.5"
    >
      <span className="min-w-0 flex-1 space-y-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <Text role="item" tone="default" weight="semibold">{row.ref}</Text>
          <Tag tone={row.tone} fill="tint" size="sm">{status(row.run.status)}</Tag>
          <Text role="caption" tone={supportingTone} className="ml-auto shrink-0">{relative(row.startedAt)}</Text>
        </span>
        <span className="block min-w-0">
          <Text role="item" weight="medium" className="block leading-snug wrap-anywhere">
            {caseName ?? dataset ?? t("pickerNoDataset")}
          </Text>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {caseName === null ? null : (
            <>
              <Text role="cell" tone={supportingTone} className="break-all">{dataset}</Text>
              <Text role="cell" tone="neutral" aria-hidden>·</Text>
            </>
          )}
          <Text role="cell" tone={supportingTone} className="break-all">{visibleScope}</Text>
          <Text role="cell" tone="neutral" aria-hidden>·</Text>
          <Text role="cell" tone={supportingTone}>{mode(row.run.mode)}</Text>
        </span>
      </span>
    </PickerOption>
  )
}

export function RunsStrip({ runs, selected }: RunsStripProps) {
  const t = useTranslations("runs")
  const status = useTranslations("domain.runStatus")
  const now = useNow()
  const navigate = useNavigate()
  const params = runsRouteApi.useParams()
  const [open, setOpen] = useState(false)
  if (runs.length === 0) return <Empty title={t("empty")} hint={t("emptyHint")} />
  const rows = runRows(runs, selected, now)
  const current = rows.find((row) => row.selected)
  const choose = (id: RunId): void => {
    setOpen(false)
    void navigate({ to: ROUTE_PATH.runs, params, search: { run: id }, resetScroll: false })
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger aria-label={current === undefined ? t("pickerPlaceholder") : t("pickerSelected", { ref: current.ref })} aria-expanded={open}>
          {current === undefined ? (
            <Text role="item" tone="neutral">{t("pickerPlaceholder")}</Text>
          ) : (
            <>
              <Dot tone={current.tone} />
              <Text role="item" weight="semibold">{current.ref}</Text>
              <Text role="tiny" tone="neutral" truncate>{status(current.run.status)}</Text>
            </>
          )}
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-[28rem] max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand label={t("pickerSearch")} filter={(value, search) => value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0}>
          <CommandInput placeholder={t("pickerSearchPlaceholder")} />
          <PickerCount>{t("runsInFlow", { count: runs.length })}</PickerCount>
          <CommandList label={t("listAria")} className="max-h-[min(60vh,32rem)]">
            <CommandEmpty>{t("noMatches")}</CommandEmpty>
            {rows.map((row) => <RunOption key={row.id} row={row} onSelect={choose} />)}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  )
}
