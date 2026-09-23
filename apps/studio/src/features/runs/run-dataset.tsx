import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRight, Database, X } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, ApiDatasetSummary, ApiRunSnapshot } from "@/domain"
import { StructuredValue, Surface, Text, ValueDisplayProvider } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { BlobText } from "@/features/call-sheet"
import { valueCell } from "@/features/trace"
import { ROUTE_PATH, runsRouteApi } from "@/lib/routes"

type DatasetData = {
  readonly summary: ApiDatasetSummary
}

const sourceOf = (itemId: string): { datasetId: string; caseName: string } | null => {
  const separator = itemId.indexOf("/")
  if (separator <= 0 || separator === itemId.length - 1) return null
  return { datasetId: itemId.slice(0, separator), caseName: itemId.slice(separator + 1) }
}

function ValuePanel({ title, value, empty }: { readonly title: string; readonly value: unknown; readonly empty: string }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <Surface variant="well" padding="sm" className="min-h-12 min-w-0">
        {value === null || value === undefined ? <Text role="hint" tone="neutral">{empty}</Text> : <StructuredValue value={value} />}
      </Surface>
    </section>
  )
}

function RunConfiguration({ snapshot, blobs, caseName }: { readonly snapshot: ApiRunSnapshot; readonly blobs: readonly BlobText[]; readonly caseName: string }) {
  const t = useTranslations("runs.dataset")
  const mode = useTranslations("domain.runMode")
  const inputRef = snapshot.input_ref
  const cell = valueCell(inputRef, inputRef?.kind === "blob"
    ? blobs.find((blob) => blob.blobId === inputRef.blob_id)?.text
    : undefined)
  return (
    <section className="space-y-3">
      <Text as="p" role="hint" tone="neutral">{t("recordedHint")}</Text>
      <Surface variant="well" padding="sm">
        <Text as="div" role="meta" tone="neutral">{t("usedCase")}</Text>
        <Text as="div" role="cell" className="break-all font-mono">{caseName}</Text>
      </Surface>
      <div className="grid gap-2 sm:grid-cols-2">
        <Surface variant="well" padding="sm">
          <Text as="div" role="meta" tone="neutral">{t("mode")}</Text>
          <Text as="div" role="cell">{mode(snapshot.mode)}</Text>
        </Surface>
        <Surface variant="well" padding="sm">
          <Text as="div" role="meta" tone="neutral">{t("scope")}</Text>
          <Text as="div" role="cell">{snapshot.start_node != null && snapshot.end_node != null
            ? t("rangeScope", { start: snapshot.start_node, end: snapshot.end_node })
            : snapshot.selected_nodes?.length ? snapshot.selected_nodes.join(", ") : t("wholeFlow")}</Text>
        </Surface>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ValuePanel title={t("recordedInput")} value={cell?.value} empty={t("notRecorded")} />
        <ValuePanel title={t("recordedContext")} value={snapshot.context} empty={t("notRecorded")} />
      </div>
      {cell?.incomplete ? <Text as="p" role="hint" tone="warning">{t("inputPreview")}</Text> : null}
    </section>
  )
}

function CurrentDataset({ data, caseName, selectedCase, selectedCaseError }: {
  readonly data: DatasetData
  readonly caseName: string
  readonly selectedCase: ApiDatasetCase | null
  readonly selectedCaseError: boolean
}) {
  const t = useTranslations("runs.dataset")
  return (
    <section className="space-y-3">
      <Text as="p" role="hint" tone="neutral">{t("currentHint")}</Text>
      <Surface variant="well" padding="sm" className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <Text as="div" role="meta" tone="neutral">{t("file")}</Text>
          <Text as="div" role="cell" className="break-all font-mono">{data.summary.path}</Text>
        </div>
        <div className="min-w-0">
          <Text as="div" role="meta" tone="neutral">{t("usedCase")}</Text>
          <Text as="div" role="cell" className="break-all font-mono">{caseName}</Text>
        </div>
      </Surface>
      {selectedCaseError ? <Text as="p" role="hint" tone="warning">{t("caseLoadError")}</Text> : selectedCase === null ? (
        <Text as="p" role="hint" tone="neutral">{t("loadingCase")}</Text>
      ) : <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <ValuePanel title={t("caseInput")} value={selectedCase.inputs} empty={t("notConfigured")} />
          <ValuePanel title={t("caseContext")} value={selectedCase.context} empty={t("notConfigured")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <ValuePanel title={t("metadata")} value={selectedCase.metadata} empty={t("notConfigured")} />
          <ValuePanel title={t("expectedOutput")} value={selectedCase.expected_output} empty={t("notConfigured")} />
        </div>
        {selectedCase.node_outputs == null || Object.keys(selectedCase.node_outputs).length === 0 ? null : (
          <ValuePanel title={t("nodeOutputs")} value={selectedCase.node_outputs} empty={t("notConfigured")} />
        )}
      </div>}
    </section>
  )
}

export function RunDataset({ snapshot, blobs }: { readonly snapshot: ApiRunSnapshot; readonly blobs: readonly BlobText[] }) {
  const t = useTranslations("runs.dataset")
  const { api } = runsRouteApi.useRouteContext()
  const params = runsRouteApi.useParams()
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<DatasetData | null>(null)
  const [selectedCase, setSelectedCase] = useState<ApiDatasetCase | null>(null)
  const [selectedCaseError, setSelectedCaseError] = useState(false)
  const [error, setError] = useState(false)
  const source = snapshot.dataset_item_id === null || snapshot.dataset_item_id === undefined ? null : sourceOf(snapshot.dataset_item_id)
  const datasetId = source?.datasetId ?? ""
  const caseName = source?.caseName ?? ""
  const changeOpen = (next: boolean): void => {
    if (next) {
      setData(null)
      setError(false)
      setSelectedCase(null)
      setSelectedCaseError(false)
    }
    setOpen(next)
  }

  useEffect(() => {
    if (!open || datasetId.length === 0) return
    let active = true
    void api.datasets.detail(datasetId).then((summary) => {
      if (active) setData({ summary })
    }).catch(() => {
      if (active) setError(true)
    })
    return () => { active = false }
  }, [api, datasetId, open])

  useEffect(() => {
    if (!open || datasetId.length === 0 || caseName.length === 0) return
    let active = true
    void api.datasets.caseDetail(datasetId, caseName).then(
      (item) => { if (active) setSelectedCase(item) },
      () => { if (active) setSelectedCaseError(true) },
    )
    return () => { active = false }
  }, [api, datasetId, open, caseName])

  if (source === null) return null

  return (
    <div className="min-w-0 max-w-full">
      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogTrigger asChild>
          <Button type="button" size="sm" variant="outline" aria-label={`${t("label")} ${datasetId} / ${caseName}`} title={`${datasetId} / ${caseName}`} className="h-auto max-h-16 min-h-8 max-w-full min-w-0 justify-start gap-2 overflow-x-hidden overflow-y-auto py-1 text-left whitespace-normal">
            <Database aria-hidden className="size-4 text-muted-foreground" />
            <span className="shrink-0 text-muted-foreground">{t("label")}</span>
            <span className="min-w-0 break-all font-mono font-semibold">{datasetId}</span>
          </Button>
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          style={{ maxWidth: "calc(100vw - 1.5rem)" }}
          className="grid h-[min(92dvh,1000px)] w-[calc(100vw-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[86vw] lg:w-[min(70vw,1100px)]"
        >
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="break-all text-lg">{t("title", { datasetId })}</DialogTitle>
              <DialogDescription className="mt-1 break-all font-mono">{caseName}</DialogDescription>
            </div>
            <Button type="button" size="icon-sm" variant="ghost" aria-label={t("close")} onClick={() => { setOpen(false) }}><X aria-hidden /></Button>
          </div>
          <ValueDisplayProvider mode="flat">
            <Tabs defaultValue="dataset" className="min-h-0">
              <TabsList className="shrink-0 px-4 sm:px-5">
                <TabsTrigger value="dataset">{t("currentTitle")}</TabsTrigger>
                <TabsTrigger value="run">{t("recordedTitle")}</TabsTrigger>
              </TabsList>
              <TabsContent value="dataset" className="min-h-0 space-y-4 overflow-y-auto bg-background-subtle px-5 py-4">
                {error ? <Text as="p" role="hint" tone="warning">{t("loadError")}</Text> : data === null ? (
                  <Text as="p" role="hint" tone="neutral">{t("loading")}</Text>
                ) : (
                  <CurrentDataset
                    data={data}
                    caseName={caseName}
                    selectedCase={selectedCase}
                    selectedCaseError={selectedCaseError}
                  />
                )}
              </TabsContent>
              <TabsContent value="run" className="min-h-0 overflow-y-auto bg-background-subtle px-5 py-4">
                <RunConfiguration snapshot={snapshot} blobs={blobs} caseName={caseName} />
              </TabsContent>
            </Tabs>
            <div className="flex justify-end border-t border-border px-5 py-3">
              <Button asChild variant="outline" size="sm">
                <Link to={ROUTE_PATH.datasets} params={params} search={{ dataset: datasetId, case: caseName }}>
                  {t("openPage")}<ArrowUpRight aria-hidden className="size-3.5" />
                </Link>
              </Button>
            </div>
          </ValueDisplayProvider>
        </DialogContent>
      </Dialog>
    </div>
  )
}
