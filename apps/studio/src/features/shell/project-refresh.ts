import type { ApiSpecEvent } from "@/domain"
import { ROUTE_ID } from "@/lib/routes"
import { isRecord } from "@/lib/sse"

type ProjectEventType = ApiSpecEvent["type"]

type ResearchEventType = "series_started" | "series_progress" | "series_status_changed" | "finding_written" | "experiment_changed"

export type ResearchEvent = Extract<ApiSpecEvent, { readonly type: ResearchEventType }>

type SpecChange = Exclude<ApiSpecEvent, ResearchEvent>

export type RefreshMatch = { readonly routeId: string; readonly params: unknown }

export type ResearchTouch = {
  readonly experimentList: boolean
  readonly seriesList: boolean
  readonly experiment: string | null
  readonly series: string | null
}

export type RefreshPlan = { readonly everything: boolean; readonly touches: readonly ResearchTouch[] }

export type PathLedger = ReadonlyMap<string, number>

type Scope = { readonly experimentList: boolean; readonly seriesList: boolean; readonly experimentPage: boolean; readonly seriesPage: boolean }

type MatchRule = (touch: ResearchTouch, match: RefreshMatch) => boolean

export const LEDGER_TTL_MS = 10_000

export const EMPTY_LEDGER: PathLedger = new Map<string, number>()

const RESEARCH_TYPES: Readonly<Record<ProjectEventType, boolean>> = {
  files_changed: false,
  diagnostics_changed: false,
  resync: false,
  series_started: true,
  series_progress: true,
  series_status_changed: true,
  finding_written: true,
  experiment_changed: true,
}

const SCOPES: Readonly<Record<ResearchEventType, Scope>> = {
  series_started: { experimentList: true, seriesList: true, experimentPage: true, seriesPage: true },
  series_progress: { experimentList: false, seriesList: true, experimentPage: true, seriesPage: true },
  series_status_changed: { experimentList: true, seriesList: true, experimentPage: true, seriesPage: true },
  finding_written: { experimentList: true, seriesList: false, experimentPage: true, seriesPage: true },
  experiment_changed: { experimentList: true, seriesList: false, experimentPage: true, seriesPage: false },
}

const paramOf = (params: unknown, key: string): string | null => {
  const value = isRecord(params) ? params[key] : undefined
  return typeof value === "string" ? value : null
}

const ROUTE_RULES: Readonly<Record<string, MatchRule>> = {
  [ROUTE_ID.research]: (touch) => touch.experimentList,
  [ROUTE_ID.cases]: (touch) => touch.experimentList,
  [ROUTE_ID.seriesList]: (touch) => touch.seriesList,
  [ROUTE_ID.experiment]: (touch, match) => touch.experiment !== null && paramOf(match.params, "experimentId") === touch.experiment,
  [ROUTE_ID.series]: (touch, match) => touch.series !== null && paramOf(match.params, "seriesId") === touch.series,
}

export const isResearchEvent = (event: ApiSpecEvent): event is ResearchEvent => RESEARCH_TYPES[event.type]

const seriesOf = (event: ResearchEvent): string | null => ("series_id" in event ? event.series_id : null)

export const touchOf = (event: ResearchEvent): ResearchTouch => {
  const scope = SCOPES[event.type]
  const experiment = event.experiment_id
  return {
    experimentList: scope.experimentList && experiment !== null,
    seriesList: scope.seriesList,
    experiment: scope.experimentPage ? experiment : null,
    series: scope.seriesPage ? seriesOf(event) : null,
  }
}

const researchPaths = (event: ResearchEvent): readonly string[] => ("paths" in event ? event.paths : [])

export const remember = (ledger: PathLedger, events: readonly ApiSpecEvent[], now: number): PathLedger => {
  const kept = [...ledger].filter(([, until]) => until > now)
  const fresh = events.filter(isResearchEvent).flatMap(researchPaths).map((path): [string, number] => [path, now + LEDGER_TTL_MS])
  return new Map([...kept, ...fresh])
}

const unexplained = (event: SpecChange, ledger: PathLedger): boolean =>
  !("changes" in event) || event.changes.some((change) => !ledger.has(change.path))

const isSpecChange = (event: ApiSpecEvent): event is SpecChange => !isResearchEvent(event)

export const planRefresh = (events: readonly ApiSpecEvent[], ledger: PathLedger): RefreshPlan => ({
  everything: events.filter(isSpecChange).some((event) => unexplained(event, ledger)),
  touches: events.filter(isResearchEvent).map(touchOf),
})

export const touchesMatch = (touches: readonly ResearchTouch[], match: RefreshMatch): boolean => {
  const rule = ROUTE_RULES[match.routeId]
  return rule !== undefined && touches.some((touch) => rule(touch, match))
}
