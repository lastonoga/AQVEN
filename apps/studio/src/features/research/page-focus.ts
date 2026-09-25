import type { NodeId } from "@/domain"
import type { GraphView, StepSelection } from "./graph-model"
import { blockAt, graphAnchor, slotStep, type ChangeBlock, type PageAnchor } from "./what-changes"

export type ScrollRequest = { readonly id: string; readonly seq: number }

export type FocusState = {
  readonly selection: StepSelection | null
  readonly open: ReadonlySet<string>
  readonly graph: string | null
  readonly scroll: ScrollRequest | null
}

type Views = readonly Pick<GraphView, "role" | "source">[]

export const NO_FOCUS: FocusState = { selection: null, open: new Set(), graph: null, scroll: null }

const scrollTo = (state: FocusState, id: string): ScrollRequest => ({ id, seq: (state.scroll?.seq ?? 0) + 1 })

const withOpen = (open: ReadonlySet<string>, anchor: string): ReadonlySet<string> => new Set([...open, anchor])

const without = (open: ReadonlySet<string>, anchor: string): ReadonlySet<string> => new Set([...open].filter((item) => item !== anchor))

export const openBlock = (state: FocusState, block: ChangeBlock | null): FocusState => {
  if (block === null) return state
  return { ...state, open: withOpen(state.open, block.anchor), scroll: scrollTo(state, block.anchor) }
}

export const toggleBlock = (state: FocusState, anchor: string): FocusState => {
  const open = state.open.has(anchor) ? without(state.open, anchor) : withOpen(state.open, anchor)
  return { ...state, open }
}

export const highlightGraph = (state: FocusState, views: Views, key: string): FocusState => {
  if (!views.some((view) => view.source.key === key)) return state
  return { ...state, graph: key, scroll: scrollTo(state, graphAnchor(key)) }
}

export const selectStep = (state: FocusState, step: StepSelection | null): FocusState => {
  if (step === null) return state
  return { ...state, selection: step, scroll: scrollTo(state, graphAnchor(step.graph)) }
}

export const focusSlot = (state: FocusState, views: Views, node: NodeId): FocusState => selectStep(state, slotStep(views, node))

export const initialFocus = (anchor: PageAnchor | null, views: Views, blocks: readonly ChangeBlock[]): FocusState => {
  if (anchor === null) return NO_FOCUS
  if (anchor.kind === "change") return openBlock(NO_FOCUS, blockAt(blocks, anchor.variant, anchor.node))
  if (anchor.kind === "graph") return highlightGraph(NO_FOCUS, views, anchor.key)
  return focusSlot(NO_FOCUS, views, anchor.node)
}
