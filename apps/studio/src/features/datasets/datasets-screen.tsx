import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { FileUp } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetSummary, FlowId } from "@/domain"
import { Empty, Heading, Page, PageHeader, PickerCommand, PickerCount, PickerOption, PickerTrigger, Text } from "@/components/studio"
import { CommandEmpty, CommandInput, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { datasetsRouteApi, flowRouteApi, ROUTE_PATH } from "@/lib/routes"
import { CreateDataset } from "./dataset-create"
import { DatasetCsvImport } from "./dataset-csv-import"
import { DatasetRun } from "./dataset-run"
import { CaseList } from "./case-list"

function DatasetPicker({ items, selected, flowId }: {
  readonly items: readonly ApiDatasetSummary[]
  readonly selected: ApiDatasetSummary | null
  readonly flowId: FlowId
}) {
  const [open, setOpen] = useState(false)
  const params = datasetsRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("datasets")
  if (selected === null) return null

  const choose = (id: string): void => {
    setOpen(false)
    void navigate({ to: ROUTE_PATH.datasets, params, search: { dataset: id } })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PickerTrigger
          aria-expanded={open}
          aria-label={t("pickerSelected", {
            id: selected.dataset_id,
            cases: t("cases", { count: selected.cases }),
            datasets: t("datasetsInProject", { count: items.length }),
          })}
        >
          <Text role="item" weight="semibold" truncate className="min-w-0 font-mono">{selected.dataset_id}</Text>
          <Text role="tiny" tone="neutral" className="shrink-0">{t("cases", { count: selected.cases })}</Text>
        </PickerTrigger>
      </PopoverTrigger>
      <PopoverContent align="start" className="dark w-96 max-w-[calc(100vw-2rem)] gap-0 p-1">
        <PickerCommand label={t("pickerSearch")}>
          <CommandInput aria-label={t("pickerSearch")} placeholder={t("pickerSearchPlaceholder")} />
          <PickerCount>{t("datasetsInProject", { count: items.length })}</PickerCount>
          <CommandList label={t("pickerListAria")}>
            <CommandEmpty>{t("pickerNoMatches")}</CommandEmpty>
            {items.map((item) => (
              <PickerOption
                key={item.dataset_id}
                value={item.dataset_id}
                onSelect={() => { choose(item.dataset_id) }}
                data-checked={item.dataset_id === selected.dataset_id}
                aria-current={item.dataset_id === selected.dataset_id ? "true" : undefined}
                className="min-h-14 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono font-medium">{item.dataset_id}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{t("cases", { count: item.cases })}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {item.flow_id == null ? t("noFlow") : t("forFlow", { flow: item.flow_id })}
                    {item.flow_id === flowId ? ` · ${t("current")}` : ""}
                  </span>
                </span>
              </PickerOption>
            ))}
          </CommandList>
        </PickerCommand>
      </PopoverContent>
    </Popover>
  )
}

export function DatasetsScreen() {
  const { datasets, selected, chosenCase, draft } = datasetsRouteApi.useLoaderData()
  const { flow } = flowRouteApi.useLoaderData()
  const { flowId } = datasetsRouteApi.useParams()
  const t = useTranslations("datasets")
  const [uploadOpen, setUploadOpen] = useState(false)

  if (draft !== null) return <CreateDataset key={flowId} flowId={flowId} draft={draft} />

  return (
    <Page
      width="xl"
      header={<PageHeader
        actions={[{ id: "upload", label: t("new"), variant: "default", icon: FileUp, onClick: () => { setUploadOpen(true) } }]}
        selector={<DatasetPicker items={datasets} selected={selected} flowId={flowId} />}
        detail={<Heading
          size="page"
          title={t("title")}
          tags={selected === null ? [] : [{ children: selected.flow_id == null ? t("noFlow") : t("forFlow", { flow: selected.flow_id }), tone: "neutral", fill: "outline" }]}
          below={[t("subtitle")]}
        />}
      />}
    >
      {uploadOpen ? <DatasetCsvImport flowId={flowId} onClose={() => { setUploadOpen(false) }} /> : null}
      {selected === null ? <Empty title={t("empty")} /> : (
        <div className="min-w-0">
          <CaseList key={selected.dataset_id} dataset={selected} chosen={chosenCase} />
          {selected.flow_id === flowId && chosenCase !== null ? (
            <DatasetRun key={selected.dataset_id} flowId={flowId} dataset={selected} caseItem={chosenCase} order={flow.order} />
          ) : null}
          {selected.flow_id == null ? <Text as="p" role="hint" tone="neutral" className="mt-5">{t("noFlowHint")}</Text> : null}
          {selected.flow_id != null && selected.flow_id !== flowId ? <Text as="p" role="hint" tone="neutral" className="mt-5">{t("otherFlow", { flow: selected.flow_id })}</Text> : null}
        </div>
      )}
    </Page>
  )
}
