import type { Box } from "../layout"

export type Point = { readonly x: number; readonly y: number }

export const MIN_ZOOM = 0.16
export const MAX_ZOOM = 1.6
export const ZOOM_DURATION_MS = 150
export const FOCUS_DURATION_MS = 300

const ZOOM_FACTOR = 1.15

export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

export const zoomedIn = (zoom: number): number => clamp(zoom * ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM)

export const zoomedOut = (zoom: number): number => clamp(zoom / ZOOM_FACTOR, MIN_ZOOM, MAX_ZOOM)

export const boxCentre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
