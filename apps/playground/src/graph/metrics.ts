export const NODE_WIDTH = 300
export const NODE_BASE_HEIGHT = 176
export const NESTED_HEIGHT = 64
export const FAN_WIDTH = 184
export const FAN_HEIGHT = 82
export const COLLAPSED_WIDTH = 300
export const COLLAPSED_HEIGHT = 132
export const GROUP_PAD = 28
export const GROUP_HEADER = 48
export const GROUP_NEST = 24
export const NODE_SEP = 72
export const EDGE_SEP = 28
export const RANK_SEP = 160
export const GRAPH_MARGIN = 32
export const COLUMN_GAP = 26

export const RANK_PAD = RANK_SEP / 2
export const CROSS_PAD = (NODE_SEP + EDGE_SEP) / 2

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = Point & Size
