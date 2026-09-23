import { useEffect, useRef, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Check, FileUp, X } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetSummary, FlowId } from "@/domain"
import type { SchemaCsvImportPreview, SchemaCsvTemplate } from "@/api/schema"
import { Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { casesRouteApi, ROUTE_PATH } from "@/lib/routes"
import { CsvGuide } from "./csv-guide"

const DATASET_ID = /^[a-z][a-z0-9_]{0,62}$/u

const errorText = (reason: unknown): string => reason instanceof Error ? reason.message : String(reason)

const proposedId = (file: File): string => file.name.replace(/\.csv$/iu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "")

type SavedCheck = {
  readonly count: number
  readonly canStartAt: readonly string[]
  readonly fullFlowReady: boolean
}

function PreviewChecks({ preview }: { readonly preview: SchemaCsvImportPreview }) {
  const t = useTranslations("cases.csv")
  const readyCount = preview.rows.filter((row) => row.ready).length
  const matchedColumns = preview.columns.filter((column) => column.target !== "").length
  const fullFlowCount = preview.rows.filter((row) => row.full_flow_ready === true).length
  const fullFlowKnown = preview.rows.some((row) => row.full_flow_ready !== undefined && row.full_flow_ready !== null)
  const problems = [...preview.problems, ...preview.rows.flatMap((row) => row.problems.map((problem) => `Row ${String(row.number)}: ${problem}`))]
  const nodeCounts = new Map<string, { ready: number; missing: Set<string> }>()
  for (const row of preview.rows) {
    for (const node of row.nodes) {
      const current = nodeCounts.get(node.node_id) ?? { ready: 0, missing: new Set<string>() }
      node.missing.forEach((message) => { current.missing.add(message) })
      nodeCounts.set(node.node_id, {
        ready: current.ready + Number(node.ready),
        missing: current.missing,
      })
    }
  }
  const runnableNodes = [...nodeCounts.entries()].filter(([, value]) => value.ready > 0)
  const blockedNodes = [...nodeCounts.entries()].filter(([, value]) => value.ready === 0)

  return (
    <div className="space-y-5" aria-live="polite">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <Text as="p" role="label" tone="neutral">{t("precheck")}</Text>
          <p className="mt-1 text-base font-semibold">{t("readyCases", { count: readyCount, total: preview.row_count })}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <Text as="p" role="label" tone="neutral">{t("columns")}</Text>
          <p className="mt-1 text-base font-semibold">{matchedColumns} / {preview.columns.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <Text as="p" role="label" tone="neutral">{t("result")}</Text>
          <p className={`mt-1 text-base font-semibold ${preview.ready ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
            {preview.ready ? t("readyToCreate") : t("fixBeforeCreate")}
          </p>
        </div>
      </div>

      <section aria-label={t("columnMapping")}>
        <h3 className="mb-2 text-sm font-semibold">{t("columnMapping")}</h3>
        <div className="max-h-52 overflow-auto rounded-lg border border-border bg-card">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground"><tr>
              <th className="w-[44%] px-3 py-2 font-medium">{t("sourceColumn")}</th>
              <th className="w-[44%] px-3 py-2 font-medium">{t("flowField")}</th>
              <th className="w-[12%] px-2 py-2 font-medium">{t("match")}</th>
            </tr></thead>
            <tbody>
              {preview.columns.map((column) => (
                <tr key={column.source} className="border-t border-border">
                  <td className="break-all px-3 py-2 font-mono text-xs">{column.source}</td>
                  <td className="break-all px-3 py-2 font-mono text-xs">{column.target || "—"}</td>
                  <td className={`px-2 py-2 text-xs font-medium ${column.target ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}`}>
                    {column.target ? t("matched") : t("unmatched")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {fullFlowKnown ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span className="font-semibold">{t("fullFlow")}</span>
          <span className={fullFlowCount === preview.row_count ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
            {t("fullFlowReady", { count: fullFlowCount, total: preview.row_count })}
          </span>
        </div>
      ) : <p className="text-sm text-muted-foreground">{t("runPlanUnavailable")}</p>}

      {nodeCounts.size > 0 ? (
        <section aria-label={t("nodeChecks")}>
          <h3 className="mb-2 text-sm font-semibold">{t("nodeChecks")}</h3>
          {runnableNodes.length === 0 ? <p className="text-sm text-muted-foreground">{t("noStartNodes")}</p> : (
            <div className="grid gap-2 sm:grid-cols-2">
              {runnableNodes.map(([id, value]) => (
              <div key={id} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-medium">{id}</span>
                  <span className="text-xs text-muted-foreground">{t("nodeReady", { count: value.ready, total: preview.row_count })}</span>
                </div>
                {value.ready === preview.row_count ? (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{t("canStartHere")}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">{[...value.missing][0] ?? t("needsUpstream")}</p>
                )}
              </div>
              ))}
            </div>
          )}
          {blockedNodes.length > 0 ? (
            <details className="mt-3 rounded-lg border border-border bg-card">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{t("blockedNodes", { count: blockedNodes.length })}</summary>
              <div className="max-h-56 space-y-2 overflow-auto border-t border-border p-3">
                {blockedNodes.map(([id, value]) => (
                  <details key={id} className="rounded-md border border-border px-3 py-2">
                    <summary className="cursor-pointer font-mono text-xs">{id} <span className="font-sans text-muted-foreground">· {[...value.missing][0] ?? t("needsUpstream")}</span></summary>
                    {value.missing.size > 0 ? (
                      <ul className="mt-2 space-y-1 pl-4 text-xs text-muted-foreground">
                        {[...value.missing].map((message) => <li key={message} className="list-disc">{message}</li>)}
                      </ul>
                    ) : null}
                  </details>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}

      {preview.media.length > 0 ? (
        <section aria-label={t("mediaChecks")}>
          <h3 className="mb-2 text-sm font-semibold">{t("mediaChecks")}</h3>
          <div className="max-h-40 space-y-2 overflow-auto rounded-lg border border-border bg-card p-3">
            {preview.media.map((item) => (
              <div key={`${String(item.row)}:${item.field}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="font-mono text-xs">{t("mediaRow", { row: item.row, field: item.field })}</span>
                <span className={item.ready ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"}>
                  {item.ready ? t("mediaReady", { type: item.media_type ?? "media" }) : item.problem ?? t("mediaFailed")}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {problems.length > 0 ? (
        <section aria-label={t("problems")}>
          <h3 className="mb-2 text-sm font-semibold text-destructive">{t("problems")}</h3>
          <ul className="max-h-40 space-y-1 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            {problems.map((problem, index) => <li key={index}>{problem}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export function CsvImport({ flowId, onClose }: { readonly flowId: FlowId; readonly onClose: () => void }) {
  const { api } = casesRouteApi.useRouteContext()
  const params = casesRouteApi.useParams()
  const navigate = useNavigate()
  const t = useTranslations("cases.csv")
  const [datasetId, setDatasetId] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<SchemaCsvImportPreview | null>(null)
  const [busy, setBusy] = useState<"checking" | "creating" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ApiDatasetSummary | null>(null)
  const [savedCheck, setSavedCheck] = useState<SavedCheck | null>(null)
  const [template, setTemplate] = useState<SchemaCsvTemplate | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const inputRevision = useRef(0)
  const id = datasetId.trim()
  const inputReady = DATASET_ID.test(id) && file !== null

  useEffect(() => {
    let active = true
    void api.datasets.csvTemplate(flowId).then((result) => {
      if (active) setTemplate(result)
    }).catch((reason: unknown) => {
      if (active) setTemplateError(errorText(reason))
    })
    return () => { active = false }
  }, [api.datasets, flowId])

  const check = async (): Promise<void> => {
    if (!inputReady || busy !== null) return
    setBusy("checking")
    setError(null)
    setPreview(null)
    const revision = inputRevision.current
    try {
      const result = await api.datasets.previewCsv(flowId, id, file)
      if (inputRevision.current === revision) setPreview(result)
    } catch (reason) {
      if (inputRevision.current === revision) setError(errorText(reason))
    } finally {
      setBusy(null)
    }
  }

  const create = async (): Promise<void> => {
    if (!inputReady || preview?.ready !== true || busy !== null) return
    setBusy("creating")
    setError(null)
    try {
      const imported = await api.datasets.importCsv(flowId, id, file)
      setCreated(imported)
      const [saved, names] = await Promise.all([
        api.datasets.detail(imported.dataset_id),
        api.datasets.caseNames(imported.dataset_id, null, null),
      ])
      if (saved.cases !== preview.row_count || names.length !== preview.row_count) {
        throw new Error(t("savedMismatch", { expected: preview.row_count, actual: names.length }))
      }
      const expectedNames = new Set(preview.rows.map((row) => row.name))
      if (names.some((name) => !expectedNames.has(name))) throw new Error(t("savedNamesMismatch"))
      const range = names.length > 0 ? await api.flow.datasetRange(flowId, imported.dataset_id, names) : null
      const canStartAt = range?.order.filter((node) => range.ranges.some((item) => item.start_node === node && item.available)) ?? []
      const first = range?.order[0]
      const last = range?.order.at(-1)
      const fullFlowReady = range !== null && first !== undefined && last !== undefined && range.ranges.some((item) => item.start_node === first && item.end_node === last && item.available)
      setSavedCheck({ count: names.length, canStartAt, fullFlowReady })
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      setBusy(null)
    }
  }

  const openDataset = (): void => {
    if (created === null) return
    onClose()
    void navigate({ to: ROUTE_PATH.cases, params, search: { dataset: created.dataset_id }, resetScroll: false })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && busy === null) onClose() }}>
      <DialogContent
        showCloseButton={false}
        style={{ maxWidth: "calc(100vw - 1.5rem)" }}
        className="grid h-[min(92dvh,1000px)] w-[calc(100vw-1.5rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:w-[86vw] lg:w-[min(70vw,1100px)]"
      >
        <div className="flex items-start gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg">{t("title")}</DialogTitle>
            <DialogDescription className="mt-1">{t("subtitle", { flow: flowId })}</DialogDescription>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t("cancel")} onClick={onClose} disabled={busy !== null}>
            <X aria-hidden />
          </Button>
        </div>

        <div className="min-h-0 space-y-5 overflow-y-auto bg-background-subtle p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              <span>{t("datasetId")}</span>
              <Input value={datasetId} onChange={(event) => { inputRevision.current += 1; setDatasetId(event.target.value); setPreview(null); setError(null) }} placeholder="support_case_new_cases" disabled={created !== null || busy === "creating"} aria-invalid={datasetId.length > 0 && !DATASET_ID.test(id)} />
              {datasetId.length > 0 && !DATASET_ID.test(id) ? <span className="block text-xs text-destructive">{t("invalidId")}</span> : null}
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              <span>{t("file")}</span>
              <Input type="file" accept=".csv,text/csv" onChange={(event) => {
                inputRevision.current += 1
                const next = event.target.files?.[0] ?? null
                setFile(next)
                if (next !== null && datasetId.length === 0) setDatasetId(proposedId(next))
                setPreview(null)
                setError(null)
              }} disabled={created !== null || busy === "creating"} className="h-auto min-h-8 py-1" />
            </label>
          </div>

          {template !== null ? <CsvGuide template={template} /> : (
            <p role={templateError === null ? "status" : "alert"} className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
              {templateError === null ? t("loadingTemplate") : t("templateError", { reason: templateError })}
            </p>
          )}

          <details className="rounded-lg border border-border bg-card p-4 text-sm">
            <summary className="cursor-pointer font-semibold">{t("formatTitle")}</summary>
            <div className="pt-2">
              <p className="text-muted-foreground">{t("formatHelp")}</p>
              <code className="mt-3 block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-nowrap">name,inputs.customer.customer_id,inputs.message,inputs.photo,context.date</code>
              <p className="mt-2 text-xs text-muted-foreground">{t("mediaHelp")}</p>
            </div>
          </details>

          {preview !== null ? <PreviewChecks preview={preview} /> : null}

          {savedCheck !== null ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4" role="status">
              <p className="flex items-center gap-2 font-semibold"><Check aria-hidden className="size-4" />{t("savedVerified", { count: savedCheck.count })}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("savedLaunch", { nodes: savedCheck.canStartAt.join(", ") || t("noStartNodes") })}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("savedFullFlow", { status: savedCheck.fullFlowReady ? t("canLaunch") : t("cannotLaunch") })}</p>
            </div>
          ) : null}
          {error !== null ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-popover px-5 py-3 sm:px-6">
          <Text as="p" role="hint" tone="neutral">{created === null ? t("beforeCreate") : savedCheck === null ? t("createdUnverified") : t("created")}</Text>
          <div className="flex items-center gap-2">
            {created === null ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => { void check() }} disabled={!inputReady || busy !== null}>
                  {busy === "checking" ? t("checking") : t("check")}
                </Button>
                <Button type="button" size="sm" onClick={() => { void create() }} disabled={preview?.ready !== true || busy !== null}>
                  <FileUp aria-hidden className="size-3.5" />{busy === "creating" ? t("creating") : t("create")}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" onClick={openDataset}>{t("openDataset")}</Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
