import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { FileUp } from "lucide-react"
import { useTranslations } from "use-intl"
import type { ApiDatasetCase, ApiDatasetSummary, ExperimentDetail, FlowId } from "@/domain"
import { Actions, Empty, Heading, Page, Text } from "@/components/studio"
import * as ids from "@/data/ids"
import { HandoffButton } from "@/features/chat-handoff"
import { casesRouteApi, flowRouteApi, ROUTE_PATH } from "@/lib/routes"
import { messageOf } from "@/lib/errors"
import { CaseDetail } from "./case-detail"
import { CaseFilterBar } from "./case-filter"
import { CaseList } from "./case-list"
import { CaseRun } from "./case-run"
import { CsvImport } from "./csv-import"
import { DatasetPicker } from "./dataset-picker"
import { SelectionBar, type LaunchState } from "./selection-bar"
import { useLookRange } from "./use-look-range"
import {
  addCasesPrompt,
  datasetScope,
  experimentsUsing,
  filterCases,
  orderedSelection,
  tagFacets,
  toggleName,
  toggleToken,
  withCase,
  withNames,
  withTags,
  type DatasetScope,
} from "./model"

const IDLE: LaunchState = { kind: "idle" }
const NO_SELECTION: ReadonlySet<string> = new Set()
const NO_TAGS: readonly string[] = []
const NO_DATASET = "__none__"

function ScopeLine({ dataset, scope }: { readonly dataset: ApiDatasetSummary; readonly scope: DatasetScope }) {
  const t = useTranslations("cases.scope")
  const text: Readonly<Record<DatasetScope, string>> = {
    flow: t("flow"),
    otherFlow: t("otherFlow", { flow: dataset.flow_id ?? "" }),
    inference: t("inference"),
  }
  return <Text role="meta" tone={scope === "flow" ? "neutral" : "warning"}>{text[scope]}</Text>
}

type HeaderProps = {
  readonly flowId: FlowId
  readonly datasets: readonly ApiDatasetSummary[]
  readonly selected: ApiDatasetSummary | null
  readonly scope: DatasetScope | null
  readonly onUpload: () => void
}

function CasesHeader({ flowId, datasets, selected, scope, onUpload }: HeaderProps) {
  const t = useTranslations("cases")
  const target = scope === "flow" ? selected : null
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Heading size="page" title={t("title")} />
        {selected === null ? null : <DatasetPicker items={datasets} selected={selected} flowId={flowId} />}
        {selected === null || scope === null ? null : <ScopeLine dataset={selected} scope={scope} />}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Actions actions={[{ id: "upload", label: t("actions.upload"), icon: FileUp, onClick: onUpload }]} />
        <HandoffButton
          label={target === null ? t("actions.writeCases") : t("actions.addCases")}
          prompt={() => addCasesPrompt(flowId, target)}
        />
      </div>
    </div>
  )
}

type CasesBodyProps = {
  readonly flowId: FlowId
  readonly order: readonly string[]
  readonly dataset: ApiDatasetSummary
  readonly scope: DatasetScope
  readonly cases: readonly ApiDatasetCase[]
  readonly experiments: readonly ExperimentDetail[]
  readonly selection: ReadonlySet<string>
  readonly onSelection: (next: ReadonlySet<string>) => void
}

function CasesBody({ flowId, order, dataset, scope, cases, experiments, selection, onSelection }: CasesBodyProps) {
  const search = casesRouteApi.useSearch()
  const params = casesRouteApi.useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [revealed, setRevealed] = useState(search.case ?? null)
  const tags = search.tag ?? NO_TAGS
  const shown = filterCases(cases, { tags, query })

  const changeTags = (next: readonly string[]): void => {
    setRevealed(null)
    void navigate({ to: ROUTE_PATH.cases, params, search: (previous) => withTags(previous, next), replace: true, resetScroll: false })
  }

  const expand = (name: string | null): void => {
    setRevealed(null)
    void navigate({ to: ROUTE_PATH.cases, params, search: (previous) => withCase(previous, name), replace: true, resetScroll: false })
  }

  const detail = (item: ApiDatasetCase, id: string) => (
    <CaseDetail
      id={id}
      item={item}
      experiments={experimentsUsing(experiments, dataset.dataset_id, item)}
      run={scope === "flow" ? <CaseRun key={item.name} flowId={flowId} datasetId={dataset.dataset_id} caseName={item.name} order={order} /> : null}
    />
  )

  return (
    <div className="flex flex-col gap-3">
      <CaseFilterBar
        facets={tagFacets(cases)}
        tags={tags}
        query={query}
        shown={shown.length}
        total={cases.length}
        onToggleTag={(token) => {
          changeTags(toggleToken(tags, token))
        }}
        onQueryChange={setQuery}
        onClear={() => {
          setQuery("")
          changeTags(NO_TAGS)
        }}
      />
      <CaseList
        cases={shown}
        selection={selection}
        expanded={search.case ?? null}
        revealed={revealed}
        detail={detail}
        onToggle={(name) => {
          onSelection(toggleName(selection, name))
        }}
        onSelectShown={(selected) => {
          onSelection(withNames(selection, shown.map((item) => item.name), selected))
        }}
        onExpand={expand}
      />
    </div>
  )
}

function CasesPage() {
  const { datasets, selected, cases, experiments } = casesRouteApi.useLoaderData()
  const { flow } = flowRouteApi.useLoaderData()
  const { flowId } = casesRouteApi.useParams()
  const { api } = casesRouteApi.useRouteContext()
  const navigate = useNavigate()
  const t = useTranslations("cases.empty")
  const [uploadOpen, setUploadOpen] = useState(false)
  const [selection, setSelection] = useState<ReadonlySet<string>>(NO_SELECTION)
  const [launch, setLaunch] = useState<LaunchState>(IDLE)
  const scope = selected === null ? null : datasetScope(selected, flowId)
  const chosen = orderedSelection(cases, selection)
  const flowScoped = scope === "flow" && selected !== null
  const look = useLookRange(flowId, flowScoped ? selected.dataset_id : null, chosen, flow.order)

  const runSelected = (): void => {
    if (selected === null || !look.ready || launch.kind === "starting") return
    setLaunch({ kind: "starting" })
    void api.research.startLook(flowId, ids.datasetId(selected.dataset_id), chosen, look.stages).then(
      (seriesId) => {
        setLaunch(IDLE)
        void navigate({ to: ROUTE_PATH.series, params: { seriesId } })
      },
      (reason: unknown) => {
        setLaunch({ kind: "failed", message: messageOf(reason) })
      },
    )
  }

  return (
    <Page
      width="xl"
      header={
        <CasesHeader
          flowId={flowId}
          datasets={datasets}
          selected={selected}
          scope={scope}
          onUpload={() => {
            setUploadOpen(true)
          }}
        />
      }
    >
      {uploadOpen ? <CsvImport flowId={flowId} onClose={() => { setUploadOpen(false) }} /> : null}
      {selected === null || scope === null ? <Empty title={t("title")} hint={t("hint")} /> : (
        <CasesBody
          flowId={flowId}
          order={flow.order}
          dataset={selected}
          scope={scope}
          cases={cases}
          experiments={experiments}
          selection={selection}
          onSelection={setSelection}
        />
      )}
      {chosen.length === 0 ? null : (
        <SelectionBar
          count={chosen.length}
          flowScoped={flowScoped}
          look={look}
          launch={launch}
          onRun={runSelected}
          onClear={() => {
            setSelection(NO_SELECTION)
            setLaunch(IDLE)
          }}
        />
      )}
    </Page>
  )
}

export function CasesScreen() {
  const { selected } = casesRouteApi.useLoaderData()
  return <CasesPage key={selected?.dataset_id ?? NO_DATASET} />
}
