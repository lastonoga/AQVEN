import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { useTranslations } from "use-intl"
import type { ApiDatasetBatch, ApiDatasetBatchCase, FlowId } from "@/domain"
import { Text, TitledPanel } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import * as ids from "@/data/ids"
import { datasetsRouteApi, ROUTE_PATH } from "@/lib/routes"

type CasesPage = {
  readonly items: readonly ApiDatasetBatchCase[]
  readonly next_cursor: string | null
  readonly total_estimate: number | null
}

const shortId = (id: string): string => `#${id.slice(-6)}`
const STATUSES = ["pending", "starting", "queued", "running", "suspended", "completed", "failed", "cancelled", "start_failed"] as const

export function DatasetBatches({ flowId, datasetId }: { readonly flowId: FlowId; readonly datasetId: string }) {
  const { api } = datasetsRouteApi.useRouteContext()
  const params = datasetsRouteApi.useParams()
  const search = datasetsRouteApi.useSearch()
  const t = useTranslations("datasets")
  const runMode = useTranslations("domain.runMode")
  const activeId = search.batch ?? null
  const [history, setHistory] = useState<readonly ApiDatasetBatch[]>([])
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [batchResponse, setBatchResponse] = useState<{ id: string; batch: ApiDatasetBatch } | null>(null)
  const [casesResponse, setCasesResponse] = useState<{ key: string; cases: CasesPage | null; error: string | null } | null>(null)
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null])
  const cursor = cursors.at(-1) ?? null
  const requestKey = JSON.stringify([activeId, query, status, cursor])
  const batch = batchResponse?.id === activeId ? batchResponse.batch : null
  const cases = casesResponse?.key === requestKey ? casesResponse.cases : null
  const caseError = casesResponse?.key === requestKey ? casesResponse.error : null

  useEffect(() => {
    let active = true
    void api.evals.datasetBatches(flowId, datasetId).then(
      (page) => {
        if (!active) return
        setHistory(page.items)
        setHistoryCursor(page.next_cursor)
      },
      (reason: unknown) => { if (active) setHistoryError(reason instanceof Error ? reason.message : String(reason)) },
    )
    return () => { active = false }
  }, [activeId, api, datasetId, flowId])

  useEffect(() => {
    if (activeId === null) return
    let active = true
    let timer: ReturnType<typeof setInterval> | null = null
    const read = async (): Promise<void> => {
      try {
        const [nextBatch, nextCases] = await Promise.all([
          api.evals.datasetBatch(activeId),
          api.evals.datasetBatchCases(activeId, query || null, status, cursor),
        ])
        if (!active) return
        setBatchResponse({ id: activeId, batch: nextBatch })
        setCasesResponse({ key: requestKey, cases: nextCases, error: null })
        if (nextBatch.status !== "running" && timer !== null) {
          clearInterval(timer)
          timer = null
        }
      } catch (reason) {
        if (active) setCasesResponse({ key: requestKey, cases: null, error: reason instanceof Error ? reason.message : String(reason) })
      }
    }
    timer = setInterval(() => { void read() }, 2000)
    void read()
    return () => {
      active = false
      if (timer !== null) clearInterval(timer)
    }
  }, [activeId, api, cursor, query, requestKey, status])

  const loadMore = async (): Promise<void> => {
    if (historyCursor === null) return
    try {
      const page = await api.evals.datasetBatches(flowId, datasetId, historyCursor)
      setHistory((current) => [...current, ...page.items])
      setHistoryCursor(page.next_cursor)
    } catch (reason) {
      setHistoryError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <TitledPanel size="section" title={t("batchHistory")} description={datasetId} className="mt-6" surface="raised">
      <div className="space-y-4 p-4">
        {historyError === null ? null : <Text as="p" role="hint" tone="destructive">{historyError}</Text>}
        {history.length === 0 ? <Text as="p" role="hint" tone="neutral">{t("noBatches")}</Text> : (
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <Link
                key={item.batch_id}
                to={ROUTE_PATH.datasets}
                params={params}
                search={{ dataset: datasetId, batch: item.batch_id }}
                resetScroll={false}
                className={`rounded-lg border px-3 py-2 text-xs ${item.batch_id === activeId ? "border-foreground bg-muted" : "border-border bg-background hover:border-ring"}`}
              >
                <span className="font-mono font-semibold">{shortId(item.batch_id)}</span>
                <span className="ml-2 text-muted-foreground">{t("batchCases", { count: item.cases_total })}</span>
              </Link>
            ))}
          </div>
        )}
        {historyCursor === null ? null : <Button type="button" size="sm" variant="outline" onClick={() => { void loadMore() }}>{t("moreBatches")}</Button>}
        {activeId === null ? null : (
          <div className="space-y-4 border-t border-border pt-4">
            {caseError === null ? null : <Text as="p" role="hint" tone="destructive">{caseError}</Text>}
            {batch === null ? <Text as="p" role="hint" tone="neutral">{t("loadingBatch")}</Text> : (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <strong className="font-mono">{t("batchTitle", { id: shortId(batch.batch_id) })}</strong>
                  <span>{t("batchProgress", { completed: batch.cases_completed, total: batch.cases_total, failed: batch.cases_failed })}</span>
                  <span className="text-muted-foreground">{batch.status}</span>
                  <span className="ml-auto text-muted-foreground">{t("batchCost", { cost: Number(batch.cost_usd).toFixed(4) })}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{runMode(batch.mode)}</span>
                  <span>{batch.start_node != null && batch.end_node != null
                    ? t("batchRangeScope", { start: batch.start_node, end: batch.end_node })
                    : t("batchScope", { nodes: batch.selected_nodes?.length ? batch.selected_nodes.join(", ") : t("whole") })}</span>
                  <span title={batch.dataset_file_hash}>{t("batchVersion", { hash: batch.dataset_file_hash.slice(0, 21) })}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form className="flex min-w-[180px] flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setQuery(draft.trim()); setCursors([null]) }}>
                    <Input aria-label={t("searchBatchCases")} value={draft} onChange={(event) => { setDraft(event.target.value) }} placeholder={t("searchBatchCases")} />
                    <Button type="submit" size="sm" variant="outline">{t("search")}</Button>
                  </form>
                  <select aria-label={t("filterStatus")} value={status ?? ""} onChange={(event) => { setStatus(event.target.value || null); setCursors([null]) }} className="h-8 rounded-lg border border-input bg-background px-2.5 text-sm">
                    <option value="">{t("allStatuses")}</option>
                    {STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
                  </select>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table aria-label={t("batchResults")} className="w-full min-w-[440px] text-left text-sm">
                    <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2">{t("caseName")}</th><th className="w-28 px-3 py-2">{t("statusColumn")}</th><th className="w-24 px-3 py-2">{t("runColumn")}</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {cases?.items.map((item) => (
                        <tr key={item.case_name}>
                          <td className="px-3 py-2 font-mono text-xs">{item.case_name}{item.error === null ? null : <Text as="div" role="hint" tone="destructive">{item.error}</Text>}</td>
                          <td className="px-3 py-2 text-xs">{item.status.replaceAll("_", " ")}</td>
                          <td className="px-3 py-2 text-xs">{item.run_id == null ? "—" : <Link to={ROUTE_PATH.runs} params={params} search={{ run: ids.runId(item.run_id) }} className="text-primary underline underline-offset-2">{shortId(item.run_id)}</Link>}</td>
                        </tr>
                      ))}
                      {cases?.items.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">{t("noMatchingCases")}</td></tr> : null}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("casePage", { page: cursors.length })}</span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" disabled={cursors.length === 1} onClick={() => { setCursors((current) => current.slice(0, -1)) }}>{t("previousPage")}</Button>
                    <Button type="button" size="sm" variant="outline" disabled={cases?.next_cursor == null} onClick={() => { if (cases?.next_cursor != null) setCursors((current) => [...current, cases.next_cursor]) }}>{t("nextPage")}</Button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </TitledPanel>
  )
}
