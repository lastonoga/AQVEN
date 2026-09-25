import { useEffect, useState } from "react"
import { useLocation } from "@tanstack/react-router"
import type { NodeId } from "@/domain"
import { experimentRouteApi } from "@/lib/routes"
import type { GraphView, StepSelection } from "./graph-model"
import { focusSlot, highlightGraph, initialFocus, openBlock, toggleBlock, type FocusState } from "./page-focus"
import { graphAnchor, parseAnchor, stepAnchor, type ChangeBlock } from "./what-changes"

export type PageFocus = {
  readonly selection: StepSelection | null
  readonly open: ReadonlySet<string>
  readonly graph: string | null
  readonly select: (selection: StepSelection) => void
  readonly close: () => void
  readonly toggle: (anchor: string) => void
  readonly reveal: (block: ChangeBlock) => void
  readonly showGraph: (key: string) => void
  readonly showSlot: (node: NodeId) => void
}

const INTO_VIEW: ScrollIntoViewOptions = { block: "start" }
const NO_ANCHOR = ""

export function usePageFocus(views: readonly GraphView[], blocks: readonly ChangeBlock[]): PageFocus {
  const hash = useLocation({ select: (location) => location.hash })
  const navigate = experimentRouteApi.useNavigate()
  const [state, setState] = useState<FocusState>(() => initialFocus(parseAnchor(hash), views, blocks))
  const { scroll } = state
  useEffect(() => {
    if (scroll === null) return
    document.getElementById(scroll.id)?.scrollIntoView(INTO_VIEW)
  }, [scroll])
  const mark = (anchor: string): void => {
    void navigate({ to: ".", hash: anchor, replace: true, resetScroll: false, hashScrollIntoView: false })
  }
  const update = (next: (current: FocusState) => FocusState): void => {
    setState(next)
  }
  return {
    selection: state.selection,
    open: state.open,
    graph: state.graph,
    select: (selection) => {
      update((current) => ({ ...current, selection }))
    },
    close: () => {
      update((current) => ({ ...current, selection: null }))
      if (parseAnchor(hash)?.kind === "step") mark(NO_ANCHOR)
    },
    toggle: (anchor) => {
      update((current) => toggleBlock(current, anchor))
      if (!state.open.has(anchor)) mark(anchor)
      if (state.open.has(anchor) && hash === anchor) mark(NO_ANCHOR)
    },
    reveal: (block) => {
      update((current) => openBlock(current, block))
      mark(block.anchor)
    },
    showGraph: (key) => {
      update((current) => highlightGraph(current, views, key))
      mark(graphAnchor(key))
    },
    showSlot: (node) => {
      update((current) => focusSlot(current, views, node))
      mark(stepAnchor(node))
    },
  }
}
