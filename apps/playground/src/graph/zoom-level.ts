export type ZoomLevel = 0 | 1 | 2 | 3

export const LEVELS: readonly ZoomLevel[] = [0, 1, 2, 3]

export const ENTER: Readonly<Record<ZoomLevel, number>> = { 0: 0, 1: 0.42, 2: 0.8, 3: 1.3 }

export const EXIT: Readonly<Record<ZoomLevel, number>> = { 0: 0, 1: 0.38, 2: 0.72, 3: 1.18 }

export const DEFAULT_LEVEL: ZoomLevel = 2

const highest = (zoom: number, gates: Readonly<Record<ZoomLevel, number>>): ZoomLevel =>
  LEVELS.reduce<ZoomLevel>((found, level) => (zoom >= gates[level] ? level : found), 0)

export const packLevels = (zoom: number): number => highest(zoom, ENTER) * 4 + highest(zoom, EXIT)

export const unpackLevels = (code: number): { up: ZoomLevel; down: ZoomLevel } => ({
  up: Math.floor(code / 4) as ZoomLevel,
  down: (code % 4) as ZoomLevel,
})

export const stepLevel = (up: ZoomLevel, down: ZoomLevel, previous: ZoomLevel): ZoomLevel => {
  if (up > previous) return up
  if (down < previous) return down
  return previous
}

export const levelOf = (zoom: number, previous: ZoomLevel): ZoomLevel => {
  const { up, down } = unpackLevels(packLevels(zoom))
  return stepLevel(up, down, previous)
}

export type LevelStyle = {
  data: number
  line: number
  rows: number
  chars: number
}

export const LEVEL_STYLE: Readonly<Record<ZoomLevel, LevelStyle>> = {
  0: { data: 0, line: 0, rows: 0, chars: 0 },
  1: { data: 20, line: 26, rows: 1, chars: 24 },
  2: { data: 11.5, line: 17, rows: 11, chars: 46 },
  3: { data: 9.5, line: 12.5, rows: 15, chars: 58 },
}
