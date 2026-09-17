import type { Rect } from "@/domain"

export type PaneSize = { readonly width: number; readonly height: number }
export type ViewportTarget = { readonly x: number; readonly y: number; readonly zoom: number }

export const MIN_ZOOM = 0.24
export const MAX_ZOOM = 1.6
export const ZOOM_DURATION_MS = 150
export const FOCUS_DURATION_MS = 300

const ZOOM_FACTOR = 1.15
const FOCUS_MARGIN_X = 180
const FOCUS_MARGIN_Y = 190
const FOCUS_MIN_ZOOM = 0.3
const FOCUS_MAX_ZOOM = 1.05

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

export const zoomedIn = (zoom: number): number => clamp(zoom * ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM)

export const zoomedOut = (zoom: number): number => clamp(zoom / ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM)

export const stageFocus = (rect: Rect, pane: PaneSize): ViewportTarget => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2,
  zoom: clamp(Math.min((pane.width - FOCUS_MARGIN_X) / rect.width, (pane.height - FOCUS_MARGIN_Y) / rect.height), FOCUS_MIN_ZOOM, FOCUS_MAX_ZOOM),
})
