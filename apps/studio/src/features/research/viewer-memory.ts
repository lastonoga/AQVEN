import type { ExperimentId, ExperimentSummary, IsoDateTime } from "@/domain"
import * as ids from "@/data/ids"
import { readViewerItem, writeViewerItem } from "@/lib/viewer-storage"
import { activityTime, DEFAULT_GROUPING, isGrouping, type Grouping } from "./experiment-groups"

export const GROUPING_KEY = "aqven:research:grouping"
const SEEN_PREFIX = "aqven:research:seen:"

export const seenKey = (projectRoot: string): string => `${SEEN_PREFIX}${projectRoot}`

export const rememberedGrouping = (): Grouping => {
  const raw = readViewerItem(GROUPING_KEY)
  return raw !== null && isGrouping(raw) ? raw : DEFAULT_GROUPING
}

export const rememberGrouping = (grouping: Grouping): void => {
  writeViewerItem(GROUPING_KEY, grouping)
}

const momentOf = (raw: unknown): IsoDateTime | null =>
  typeof raw !== "string" || Number.isNaN(Date.parse(raw)) ? null : ids.isoDateTime(raw)

const later = (left: IsoDateTime | null, right: IsoDateTime | null): IsoDateTime | null => {
  if (left === null) return right
  if (right === null) return left
  return Date.parse(right) > Date.parse(left) ? right : left
}

export type SeenMarks = { readonly visit: IsoDateTime; readonly items: ReadonlyMap<ExperimentId, IsoDateTime> }

type StoredMarks = { readonly visit?: unknown; readonly items?: unknown }

const NO_ITEMS: ReadonlyMap<ExperimentId, IsoDateTime> = new Map()

const stored = (raw: string): StoredMarks | null => {
  try {
    const value: unknown = JSON.parse(raw)
    return typeof value === "object" && value !== null ? value : null
  } catch {
    return null
  }
}

const storedItems = (raw: unknown): ReadonlyMap<ExperimentId, IsoDateTime> => {
  if (typeof raw !== "object" || raw === null) return NO_ITEMS
  const entries = Object.entries(raw).flatMap(([id, at]): [ExperimentId, IsoDateTime][] => {
    const moment = momentOf(at)
    return moment === null ? [] : [[ids.experimentId(id), moment]]
  })
  return new Map(entries)
}

const parsedMarks = (raw: string): SeenMarks | null => {
  const legacy = momentOf(raw)
  if (legacy !== null) return { visit: legacy, items: NO_ITEMS }
  const value = stored(raw)
  const visit = value === null ? null : momentOf(value.visit)
  return visit === null || value === null ? null : { visit, items: storedItems(value.items) }
}

export const newestActivity = (experiments: readonly ExperimentSummary[]): IsoDateTime | null =>
  experiments.reduce<IsoDateTime | null>((newest, experiment) => later(newest, experiment.activity.last), null)

export const seenMarks = (projectRoot: string): SeenMarks | null => {
  const raw = readViewerItem(seenKey(projectRoot))
  return raw === null ? null : parsedMarks(raw)
}

export const markSeen = (projectRoot: string, visible: readonly ExperimentSummary[]): void => {
  const current = seenMarks(projectRoot)
  const visit = later(current?.visit ?? null, newestActivity(visible))
  if (visit === null) return
  const items = new Map(current?.items ?? NO_ITEMS)
  for (const experiment of visible) {
    const moment = later(items.get(experiment.id) ?? null, experiment.activity.last)
    if (moment !== null) items.set(experiment.id, moment)
  }
  writeViewerItem(seenKey(projectRoot), JSON.stringify({ visit, items: Object.fromEntries(items) }))
}

export const isNewSince = (experiment: ExperimentSummary, seen: SeenMarks | null): boolean => {
  if (seen === null) return false
  const mark = seen.items.get(experiment.id) ?? seen.visit
  return activityTime(experiment) > Date.parse(mark)
}
