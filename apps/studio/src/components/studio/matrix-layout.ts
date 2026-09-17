import type { Tone } from "./tone"

export type CellPaint = { readonly surface?: Tone | "subtle"; readonly accent?: Tone }

export type MatrixGround = "card" | "subtle"

export type CellSurface = Tone | MatrixGround | "none"

export type ResolvedPaint = { readonly surface: CellSurface; readonly accent: Tone | undefined }

export const ITEM_TRACK = "minmax(0,1fr)"

export const NO_PAINT: CellPaint = {}

const GROUNDS: ReadonlySet<CellSurface> = new Set<CellSurface>(["card", "subtle", "none"])

export const isGround = (surface: CellSurface): surface is MatrixGround | "none" => GROUNDS.has(surface)

export const rowsTemplate = (tracks: readonly (string | undefined)[]): string =>
  tracks.map((track) => track ?? ITEM_TRACK).join(" ")

const itemTrack = (minItemWidth: number): string => `minmax(${String(minItemWidth)}px, 1fr)`

const trackCount = (itemCount: number, hasTrailing: boolean): number => itemCount + (hasTrailing ? 1 : 0)

export const columnsTemplate = (labelWidth: number, itemCount: number, minItemWidth: number, hasTrailing: boolean): string => {
  const track = itemTrack(minItemWidth)
  const repeated = itemCount === 0 ? [] : [`repeat(${String(itemCount)}, ${track})`]
  const trailing = hasTrailing ? [track] : []
  return [`${String(labelWidth)}px`, ...repeated, ...trailing].join(" ")
}

export const columnsMinWidth = (labelWidth: number, itemCount: number, minItemWidth: number, hasTrailing: boolean): number =>
  labelWidth + trackCount(itemCount, hasTrailing) * (minItemWidth + 1)

export const resolvePaint = (ground: MatrixGround | "none", itemPaint: CellPaint, fieldPaint: CellPaint): ResolvedPaint => {
  const itemSurface = ground === "card" ? itemPaint.surface : undefined
  return {
    surface: fieldPaint.surface ?? itemSurface ?? ground,
    accent: fieldPaint.accent ?? itemPaint.accent,
  }
}
