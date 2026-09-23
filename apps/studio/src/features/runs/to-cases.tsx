import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { ListPlus, X } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiCaseDraft, ApiDatasetSummary, ApiRunSnapshot, RunId } from "@/domain"
import { ChoiceGroup, Surface, Text, TextBlock } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import * as ids from "@/data/ids"
import { HandoffButton } from "@/features/chat-handoff"
import { messageOf } from "@/lib/errors"
import { defaultDataset, flowDatasets, toCasesPrompt } from "./case-draft"
import { datasetItemOf } from "./expected"

export type ToCasesProps = { readonly snapshot: ApiRunSnapshot }

type Catalog =
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string }
  | { readonly kind: "ready"; readonly datasets: readonly ApiDatasetSummary[] }

type Draft =
  | { readonly kind: "loading"; readonly key: string }
  | { readonly kind: "failed"; readonly key: string; readonly message: string }
  | { readonly kind: "ready"; readonly key: string; readonly draft: ApiCaseDraft }

const DIALOG_WIDTH = { maxWidth: "min(92vw, 760px)" } as const

function useCatalog(): Catalog {
  const { api } = useRouter().options.context
  const [catalog, setCatalog] = useState<Catalog>({ kind: "loading" })
  useEffect(() => {
    let live = true
    void api.datasets.list().then(
      (datasets) => {
        if (live) setCatalog({ kind: "ready", datasets })
      },
      (reason: unknown) => {
        if (live) setCatalog({ kind: "failed", message: messageOf(reason) })
      },
    )
    return () => {
      live = false
    }
  }, [api])
  return catalog
}

function useCaseDraft(datasetId: string, runId: RunId): Draft {
  const { api } = useRouter().options.context
  const key = `${datasetId}/${runId}`
  const [draft, setDraft] = useState<Draft>({ kind: "loading", key })
  useEffect(() => {
    let live = true
    void api.datasets.caseFromRun(datasetId, runId).then(
      (loaded) => {
        if (live) setDraft({ kind: "ready", key, draft: loaded })
      },
      (reason: unknown) => {
        if (live) setDraft({ kind: "failed", key, message: messageOf(reason) })
      },
    )
    return () => {
      live = false
    }
  }, [api, datasetId, runId, key])
  return draft.key === key ? draft : { kind: "loading", key }
}

function Pending({ label }: { readonly label: string }) {
  return (
    <Text role="hint" tone="neutral" asChild>
      <div role="status" className="flex items-center gap-2">
        <Spinner aria-hidden="true" />
        {label}
      </div>
    </Text>
  )
}

function Failed({ message }: { readonly message: string }) {
  return (
    <Text role="hint" tone="destructive" asChild>
      <p role="alert">{message}</p>
    </Text>
  )
}

function Footer({ prompt }: { readonly prompt: () => string }) {
  const t = useTranslations("runs.toCases")
  return (
    <div className="border-t border-border px-5 py-3">
      <HandoffButton label={t("handoff")} prompt={prompt} variant="default" />
    </div>
  )
}

function DraftPreview({ snapshot, datasetId }: { readonly snapshot: ApiRunSnapshot; readonly datasetId: string }) {
  const t = useTranslations("runs.toCases")
  const draft = useCaseDraft(datasetId, ids.runId(snapshot.run_id))
  const item = datasetItemOf(snapshot.dataset_item_id)
  const yaml = draft.kind === "ready" ? draft.draft.yaml : null
  const prompt = (): string => toCasesPrompt({ flowId: snapshot.flow_id, runId: snapshot.run_id, datasetId, item }, yaml)
  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {draft.kind === "loading" ? <Pending label={t("drafting")} /> : null}
        {draft.kind === "failed" ? <Failed message={t("failed", { reason: draft.message })} /> : null}
        {draft.kind === "ready" ? (
          <>
            <Text as="p" role="hint" tone="neutral">
              {t("draftName", { name: draft.draft.case.name, dataset: draft.draft.dataset_id })}
            </Text>
            <Surface variant="well" padding="sm" className="min-w-0">
              <TextBlock text={draft.draft.yaml} variant="code" />
            </Surface>
          </>
        ) : null}
      </div>
      <Footer prompt={prompt} />
    </>
  )
}

function NoDataset({ snapshot }: { readonly snapshot: ApiRunSnapshot }) {
  const t = useTranslations("runs.toCases")
  const prompt = (): string => toCasesPrompt({ flowId: snapshot.flow_id, runId: snapshot.run_id, datasetId: null, item: null }, null)
  return (
    <>
      <div className="px-5 py-4">
        <Text as="p" role="hint" tone="neutral">
          {t("targetNew", { flow: snapshot.flow_id })}
        </Text>
      </div>
      <Footer prompt={prompt} />
    </>
  )
}

function DatasetChoice({ datasets, value, onChange }: { readonly datasets: readonly ApiDatasetSummary[]; readonly value: string; readonly onChange: (next: string) => void }) {
  const t = useTranslations("runs.toCases")
  if (datasets.length < 2) {
    return (
      <Text as="p" role="hint" tone="neutral">
        {t("targetDataset", { dataset: value })}
      </Text>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Text role="hint" tone="neutral">
        {t("chooseDataset")}
      </Text>
      <ChoiceGroup
        appearance="chip"
        size="sm"
        label={t("chooseDataset")}
        value={value}
        items={datasets.map((dataset) => ({ value: dataset.dataset_id, label: dataset.dataset_id }))}
        onValueChange={onChange}
      />
    </div>
  )
}

function DraftBody({ snapshot }: ToCasesProps) {
  const t = useTranslations("runs.toCases")
  const catalog = useCatalog()
  const [chosen, setChosen] = useState<string | null>(null)
  if (catalog.kind === "loading") return <div className="px-5 py-4"><Pending label={t("loadingDatasets")} /></div>
  if (catalog.kind === "failed") return <div className="px-5 py-4"><Failed message={t("failed", { reason: catalog.message })} /></div>
  const datasets = flowDatasets(catalog.datasets, snapshot)
  const datasetId = chosen ?? defaultDataset(catalog.datasets, snapshot)
  if (datasetId === null) return <NoDataset snapshot={snapshot} />
  return (
    <>
      <div className="border-b border-border px-5 py-3">
        <DatasetChoice datasets={datasets} value={datasetId} onChange={setChosen} />
      </div>
      <DraftPreview key={datasetId} snapshot={snapshot} datasetId={datasetId} />
    </>
  )
}

export function ToCases({ snapshot }: ToCasesProps) {
  const t = useTranslations("runs.toCases")
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <ListPlus aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} style={DIALOG_WIDTH} className="flex max-h-[min(88dvh,900px)] w-[min(92vw,760px)] flex-col gap-0 p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">{t("title")}</DialogTitle>
            <DialogDescription className="mt-1">{t("description")}</DialogDescription>
          </div>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={t("close")} onClick={() => { setOpen(false) }}><X aria-hidden /></Button>
        </div>
        {open ? <DraftBody snapshot={snapshot} /> : null}
      </DialogContent>
    </Dialog>
  )
}
