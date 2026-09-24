import type { SeriesOrigin, SeriesSummary } from "@/domain"

const newestFirst = (left: SeriesSummary, right: SeriesSummary): number => Date.parse(right.startedAt) - Date.parse(left.startedAt)

export const seriesListOrder = (series: readonly SeriesSummary[]): readonly SeriesSummary[] => series.toSorted(newestFirst)

export type OriginCopy = { readonly look: (flow: string) => string }

export const originText = (origin: SeriesOrigin, copy: OriginCopy): string =>
  origin.kind === "experiment" ? origin.experiment : copy.look(origin.flow)
