import { useEffect, useState } from "react"
import { Link } from "@tanstack/react-router"
import { Search } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, ApiDatasetSummary } from "@/domain"
import { flattenValueWithMedia, Text, TitledPanel } from "@/components/studio"
import { MediaOutput, type OutputMedia } from "@/components/studio/media-output"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { datasetsRouteApi, ROUTE_PATH } from "@/lib/routes"

type CasePage = {
  readonly items: readonly ApiDatasetCase[]
  readonly next_cursor: string | null
  readonly total_estimate: number | null
}

type CaseListProps = {
  readonly dataset: ApiDatasetSummary
  readonly chosen: ApiDatasetCase | null
  readonly selected: ReadonlySet<string>
  readonly onToggle: (name: string) => void
  readonly onSetPageSelection: (names: readonly string[], selected: boolean) => void
  readonly onSelect: (names: readonly string[]) => void
  readonly onClear: () => void
}

function caseFields(item: ApiDatasetCase): ReadonlyMap<string, string | OutputMedia> {
  const sections = [
    ["inputs", item.inputs],
    ["context", item.context],
    ["metadata", item.metadata],
    ["expected_output", item.expected_output],
  ] as const
  const fields = new Map(sections.flatMap(([section, value]) => {
    if (value === undefined) return []
    return flattenValueWithMedia(value).map((entry) => [
      section === "inputs" ? entry.path : entry.path === "value" ? section : `${section}.${entry.path}`,
      "media" in entry ? entry.media : entry.value,
    ] as const)
  }))
  const suppliedNodes = Object.keys(item.node_outputs ?? {})
  if (suppliedNodes.length > 0) fields.set("node_outputs", suppliedNodes.join(", "))
  return fields
}

export function CaseList({ dataset, chosen, selected, onToggle, onSetPageSelection, onSelect, onClear }: CaseListProps) {
  const { api } = datasetsRouteApi.useRouteContext()
  const params = datasetsRouteApi.useParams()
  const t = useTranslations("datasets")
  const [draft, setDraft] = useState("")
  const [query, setQuery] = useState("")
  const [cursors, setCursors] = useState<readonly (string | null)[]>([null])
  const [response, setResponse] = useState<{ key: string; page: CasePage | null; error: string | null } | null>(null)
  const [selectingAll, setSelectingAll] = useState(false)
  const cursor = cursors.at(-1) ?? null
  const requestKey = JSON.stringify([dataset.dataset_id, query, cursor])
  const page = response?.key === requestKey ? response.page : null
  const error = response?.key === requestKey ? response.error : null
  const rows = page?.items.map((item) => ({ item, fields: caseFields(item) })) ?? []
  const observedColumns = [...new Set(rows.flatMap(({ fields }) => [...fields.keys()]))]
  const columns = observedColumns.includes("node_outputs")
    ? ["node_outputs", ...observedColumns.filter((path) => path !== "node_outputs")]
    : observedColumns
  const audioColumns = new Set(rows.flatMap(({ fields }) => [...fields].flatMap(([path, value]) =>
    typeof value !== "string" && value.mediaType.startsWith("audio/") ? [path] : [])))
  const columnWidth = (path: string): string => audioColumns.has(path) ? "w-[24rem] min-w-[24rem] max-w-[24rem]" : "min-w-44 max-w-72"
  const columnCount = columns.length + 1
  const selectedOnPage = rows.filter(({ item }) => selected.has(item.name)).length
  const pageSelected = rows.length > 0 && selectedOnPage === rows.length

  useEffect(() => {
    let active = true
    void api.evals.datasetCasesPage(dataset.dataset_id, query || null, null, cursor).then(
      (result) => { if (active) setResponse({ key: requestKey, page: result, error: null }) },
      (reason: unknown) => { if (active) setResponse({ key: requestKey, page: null, error: reason instanceof Error ? reason.message : String(reason) }) },
    )
    return () => { active = false }
  }, [api, cursor, dataset.dataset_id, query, requestKey])

  const applySearch = (): void => {
    setQuery(draft.trim())
    setCursors([null])
  }
  const selectAllMatching = async (): Promise<void> => {
    setSelectingAll(true)
    setResponse((current) => current?.key === requestKey ? { ...current, error: null } : current)
    try {
      onSelect(await api.evals.datasetCaseNames(dataset.dataset_id, query || null, null))
    } catch (reason) {
      setResponse((current) => ({ key: requestKey, page: current?.key === requestKey ? current.page : null, error: reason instanceof Error ? reason.message : String(reason) }))
    } finally {
      setSelectingAll(false)
    }
  }

  return (
    <TitledPanel size="section" title={t("caseTitle")} description={t("matchingCases", { count: page?.total_estimate ?? dataset.cases })} surface="raised">
      <div className="space-y-3 p-4">
        <form className="flex items-center gap-2" onSubmit={(event) => { event.preventDefault(); applySearch() }}>
          <Input aria-label={t("searchCases")} value={draft} onChange={(event) => { setDraft(event.target.value) }} placeholder={t("searchCases")} />
          <Button type="submit" size="sm" variant="outline" aria-label={t("searchCases")}><Search aria-hidden className="size-4" /></Button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Button type="button" size="sm" variant="outline" disabled={selectingAll || page === null || page.total_estimate === 0} onClick={() => { void selectAllMatching() }}>{selectingAll ? t("selecting") : t("selectAllMatching", { count: page?.total_estimate ?? 0 })}</Button>
          <span className="font-medium text-foreground">{t("selectedCases", { count: selected.size })}</span>
          {selected.size === 0 ? null : <Button type="button" size="sm" variant="ghost" onClick={onClear}>{t("clearSelection")}</Button>}
        </div>
        {error === null ? null : <Text as="p" role="hint" tone="destructive">{error}</Text>}
        <div data-case-table-scroll className="max-h-[min(70vh,42rem)] overflow-auto overscroll-contain rounded-lg border border-border">
          <table aria-label={t("caseTitle")} className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="sticky top-0 left-0 z-30 w-64 min-w-64 max-w-64 border-r border-b border-border bg-muted px-3 py-2 font-medium">
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      aria-label={pageSelected ? t("deselectPage") : t("selectPage")}
                      checked={pageSelected}
                      disabled={rows.length === 0}
                      ref={(element) => { if (element !== null) element.indeterminate = selectedOnPage > 0 && !pageSelected }}
                      onChange={() => { onSetPageSelection(rows.map(({ item }) => item.name), !pageSelected) }}
                      className="shrink-0"
                    />
                    {t("caseName")}
                  </span>
                </th>
                {columns.map((path) => <th key={path} scope="col" className={`sticky top-0 z-20 ${columnWidth(path)} border-b border-border bg-muted px-3 py-2 font-mono font-medium whitespace-nowrap`} title={path}>{path === "node_outputs" ? t("suppliedOutputs") : path}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, fields }) => (
                <tr key={item.name} className={item.name === chosen?.name ? "bg-muted/40" : "bg-background"}>
                  <th scope="row" className={`sticky left-0 z-10 w-64 min-w-64 max-w-64 border-r border-b border-border px-3 py-3 text-left font-normal ${item.name === chosen?.name ? "bg-muted" : "bg-background"}`}>
                    <span className="flex min-w-0 items-start gap-2.5">
                      <input type="checkbox" aria-label={t("selectNamedCase", { name: item.name })} checked={selected.has(item.name)} onChange={() => { onToggle(item.name) }} className="mt-0.5 shrink-0" />
                      <Link to={ROUTE_PATH.datasets} params={params} search={{ dataset: dataset.dataset_id, case: item.name }} resetScroll={false} className="min-w-0 break-words font-mono text-xs font-semibold hover:underline">{item.name}</Link>
                    </span>
                  </th>
                  {columns.map((path) => {
                    const value = fields.get(path)
                    return <td key={path} className={`${columnWidth(path)} border-b border-border px-3 py-3 align-top font-mono text-xs leading-[1.4] whitespace-pre-wrap break-words`} title={typeof value === "string" ? value : undefined}>
                      {value === undefined ? "—" : typeof value === "string" ? value : <MediaOutput media={value} compact />}
                    </td>
                  })}
                </tr>
              ))}
              {page?.items.length === 0 ? <tr><td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">{t("noMatchingCases")}</td></tr> : null}
              {page === null && error === null ? <tr><td colSpan={columnCount} className="px-3 py-8 text-center text-muted-foreground">{t("loadingCases")}</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("casePage", { page: cursors.length })}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={cursors.length === 1} onClick={() => { setCursors((current) => current.slice(0, -1)) }}>{t("previousPage")}</Button>
            <Button type="button" size="sm" variant="outline" disabled={page?.next_cursor == null} onClick={() => { if (page?.next_cursor != null) setCursors((current) => [...current, page.next_cursor]) }}>{t("nextPage")}</Button>
          </div>
        </div>
      </div>
    </TitledPanel>
  )
}
