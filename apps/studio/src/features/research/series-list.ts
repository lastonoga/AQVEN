import type { SeriesOrigin, SeriesSummary } from "@/domain"
import { isActive } from "./presenters"

const activeRank = (series: SeriesSummary): number => (isActive(series.status) ? 0 : 1)

const newestFirst = (left: SeriesSummary, right: SeriesSummary): number => Date.parse(right.startedAt) - Date.parse(left.startedAt)

export const seriesListOrder = (series: readonly SeriesSummary[]): readonly SeriesSummary[] =>
  [...series].sort((left, right) => activeRank(left) - activeRank(right) || newestFirst(left, right))

export type OriginCopy = { readonly look: (flow: string) => string }

export const originText = (origin: SeriesOrigin, copy: OriginCopy): string =>
  origin.kind === "experiment" ? origin.experiment : copy.look(origin.flow)
