import type { ApiRun, ApiRunSnapshot, RunMode } from "@/domain"

export const RUN_LISTS = ["flow", "experiment"] as const

export type RunList = (typeof RUN_LISTS)[number]

export const LISTED_RUN_LISTS = ["experiment"] as const

export type ListedRunList = (typeof LISTED_RUN_LISTS)[number]

export type RunListSearch = { readonly list?: ListedRunList }

export type RunListFilter = { readonly mode?: RunMode }

const LIST_SEARCH: Readonly<Record<RunList, RunListSearch>> = {
  flow: {},
  experiment: { list: "experiment" },
}

const LIST_FILTER: Readonly<Record<RunList, RunListFilter>> = {
  flow: {},
  experiment: { mode: "experiment" },
}

const MODE_LIST: Readonly<Record<RunMode, RunList>> = {
  live: "flow",
  replay: "flow",
  dryrun: "flow",
  experiment: "experiment",
}

export const runListOf = (search: RunListSearch): RunList => search.list ?? "flow"

export const listSearch = (list: RunList): RunListSearch => LIST_SEARCH[list]

export const listFilter = (list: RunList): RunListFilter => LIST_FILTER[list]

export const listOfMode = (mode: RunMode): RunList => MODE_LIST[mode]

export const withOpenRun = (runs: readonly ApiRun[], open: ApiRunSnapshot | null): readonly ApiRun[] => {
  if (open === null || runs.some((run) => run.run_id === open.run_id)) return runs
  return [open, ...runs]
}
