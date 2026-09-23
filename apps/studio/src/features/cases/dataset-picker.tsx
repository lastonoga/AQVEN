import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiDatasetSummary, FlowId } from "@/domain"
import { PickerCommand, PickerCount, PickerOption, PickerTrigger, Text } from "@/components/studio"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { casesRouteApi, ROUTE_PATH } from "@/lib/routes"

type DatasetPickerProps = {
  readonly items: readonly ApiDatasetSummary[]
  readonly selected: ApiDatasetSummary
  readonly flowId: FlowId
}

function DatasetOption({ item, selected, flowId, onChoose }: {
  readonly item: ApiDatasetSummary
  readonly selected: ApiDatasetSummary
  readonly flowId: FlowId
  readonly onChoose: (id: string) => void
}) {
  const t = useTranslations("cases")
  const checked = item.dataset_id === selected.dataset_id
  const owner = item.flow_id === null || item.flow_id === undefined ? t("picker.inference") : t("picker.forFlow", { flow: item.flow_id })
  return (
    <PickerOption
      value={item.dataset_id}
      onSelect={() => {
        onChoose(item.dataset_id)
      }}
      data-checked={checked}
      aria-current={checked ? "true" : undefined}
      className="min-h-14 py-2"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-mono font-medium">{item.dataset_id}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{t("count", { count: item.cases })}</span>
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {item.flow_id === flowId ? `${owner} · ${t("picker.current")}` : owner}
        </span>
      </span>
    </PickerOption>
  )
}

export function DatasetPicker({ items, selected, flowId }: DatasetPickerProps) {
  const [open, setOpen] = useState(false)
  const params = casesRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("cases")

  const choose = (id: string): void => {
    setOpen(false)
    void navigate({ to: ROUTE_PATH.cases, params, search: { dataset: id } })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          aria-expanded={open}
          aria-label={t("picker.selected", {
            id: selected.dataset_id,
            cases: t("count", { count: selected.cases }),
            datasets: t("picker.inProject", { count: items.length }),
          })}
        >
          <Text role="item" weight="semibold" truncate className="min-w-0 font-mono">{selected.dataset_id}</Text>
          <Text role="tiny" tone="neutral" className="shrink-0">{t("count", { count: selected.cases })}</Text>
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-96 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand label={t("picker.search")}>
          <CommandInput aria-label={t("picker.search")} placeholder={t("picker.searchPlaceholder")} />
          <PickerCount>{t("picker.inProject", { count: items.length })}</PickerCount>
          <CommandList label={t("picker.listAria")}>
            <CommandEmpty>{t("picker.noMatches")}</CommandEmpty>
            {items.map((item) => (
              <DatasetOption key={item.dataset_id} item={item} selected={selected} flowId={flowId} onChoose={choose} />
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  )
}
