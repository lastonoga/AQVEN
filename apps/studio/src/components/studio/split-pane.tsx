import { Fragment, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from "react"
import { cn } from "cn"
import { usePanelRef, type Layout, type LayoutChangedMeta, type PanelImperativeHandle, type PanelSize } from "react-resizable-panels"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { readViewerItem, writeViewerItem } from "@/lib/viewer-storage"

export type SplitHandle = "ghost" | "line" | "bar"

export type SplitPanel = {
  readonly id: string
  readonly content: ReactNode
  readonly defaultSize?: number
  readonly minSize?: number
  readonly maxSize?: number
  readonly fixed?: boolean
  readonly collapsed?: boolean
  readonly onCollapsedChange?: (collapsed: boolean) => void
  readonly className?: string
}

export type SplitPaneProps = {
  readonly id: string
  readonly orientation: "horizontal" | "vertical"
  readonly panels: readonly SplitPanel[]
  readonly handle?: SplitHandle
  readonly handleClassName?: "dark"
  readonly handleLabel?: string
}

type PixelMemory = RefObject<Map<string, number>>

type PaneSlotProps = {
  readonly groupId: string
  readonly panel: SplitPanel
  readonly previous: SplitPanel | undefined
  readonly pixels: PixelMemory
  readonly handle: SplitHandle
  readonly handleClassName: "dark" | undefined
  readonly handleLabel: string | undefined
}

const HANDLE_CLASS: Readonly<Record<SplitHandle, string>> = {
  ghost: "w-1.5 bg-transparent after:w-3 hover:bg-ring data-[separator=active]:bg-ring",
  line: "w-px bg-border after:w-1.5 hover:after:bg-ring data-[separator=active]:after:bg-ring",
  bar: "h-[5px] w-full bg-border hover:bg-ring data-[separator=active]:bg-ring",
}

const PIXEL_KEY_PREFIX = "split-pane"

const COLLAPSED_SIZE = 0

const pixelKey = (groupId: string, panelId: string): string => [PIXEL_KEY_PREFIX, groupId, panelId].join(":")

const storedPixels = (groupId: string, panel: SplitPanel): number | undefined => {
  if (panel.fixed !== true) return undefined
  const raw = readViewerItem(pixelKey(groupId, panel.id))
  const value = Number(raw)
  return raw === null || !Number.isFinite(value) ? undefined : value
}

const openSize = (groupId: string, panel: SplitPanel, pixels: PixelMemory): number | undefined =>
  pixels.current.get(panel.id) ?? storedPixels(groupId, panel) ?? panel.defaultSize

const isCollapsed = (panel: SplitPanel | undefined): boolean => panel?.collapsed === true

const isCollapsible = (panel: SplitPanel): boolean => panel.collapsed !== undefined

const resizeBehavior = (fixed: boolean | undefined) => (fixed === true ? "preserve-pixel-size" : "preserve-relative-size")

const reveal = (handle: PanelImperativeHandle, size: number | undefined): void => {
  if (size === undefined) {
    handle.expand()
    return
  }
  handle.resize(size)
}

const applyCollapsed = (handle: PanelImperativeHandle | null, collapsed: boolean, size: () => number | undefined): void => {
  if (handle === null || handle.isCollapsed() === collapsed) return
  if (collapsed) {
    handle.collapse()
    return
  }
  reveal(handle, size())
}

function useCollapsedSync(groupId: string, panel: SplitPanel, pixels: PixelMemory): RefObject<PanelImperativeHandle | null> {
  const handle = usePanelRef()
  const collapsed = panel.collapsed
  const sync = useEffectEvent((target: boolean): void => {
    applyCollapsed(handle.current, target, () => openSize(groupId, panel, pixels))
  })
  const applied = useRef(collapsed)
  useLayoutEffect(() => {
    if (collapsed === undefined || applied.current === collapsed) return
    applied.current = collapsed
    sync(collapsed)
  }, [collapsed])
  return handle
}

function useDefaultSize(groupId: string, panel: SplitPanel): number | undefined {
  const collapsed = isCollapsed(panel)
  const [shown, setShown] = useState(!collapsed)
  if (!shown && !collapsed) setShown(true)
  if (!shown) return COLLAPSED_SIZE
  return storedPixels(groupId, panel) ?? panel.defaultSize
}

function PaneSlot({ groupId, panel, previous, pixels, handle, handleClassName, handleLabel }: PaneSlotProps) {
  const panelRef = useCollapsedSync(groupId, panel, pixels)
  const defaultSize = useDefaultSize(groupId, panel)
  const collapsed = isCollapsed(panel)
  const track = (size: PanelSize): void => {
    const nowCollapsed = panelRef.current?.isCollapsed() ?? collapsed
    if (size.inPixels > COLLAPSED_SIZE && !nowCollapsed) pixels.current.set(panel.id, size.inPixels)
    if (!isCollapsible(panel) || nowCollapsed === collapsed) return
    panel.onCollapsedChange?.(nowCollapsed)
  }
  const handleHidden = collapsed || isCollapsed(previous)
  return (
    <Fragment>
      {previous === undefined ? null : (
        <ResizableHandle aria-label={handleLabel} hidden={handleHidden} disabled={handleHidden} className={cn(HANDLE_CLASS[handle], handleClassName)} />
      )}
      <ResizablePanel
        id={panel.id}
        panelRef={panelRef}
        defaultSize={defaultSize}
        minSize={panel.minSize}
        maxSize={panel.maxSize}
        collapsible={isCollapsible(panel)}
        collapsedSize={COLLAPSED_SIZE}
        groupResizeBehavior={resizeBehavior(panel.fixed)}
        className={panel.className}
        inert={collapsed}
        onResize={track}
      >
        {panel.content}
      </ResizablePanel>
    </Fragment>
  )
}

export function SplitPane({ id, orientation, panels, handle = "line", handleClassName, handleLabel }: SplitPaneProps) {
  const pixels = useRef(new Map<string, number>())
  const fixedIds = panels.filter((panel) => panel.fixed === true).map((panel) => panel.id)
  const persist = (_layout: Layout, meta: LayoutChangedMeta): void => {
    if (!meta.isUserInteraction) return
    fixedIds.forEach((panelId) => {
      const size = pixels.current.get(panelId)
      if (size === undefined) return
      writeViewerItem(pixelKey(id, panelId), String(Math.round(size)))
    })
  }
  return (
    <ResizablePanelGroup id={id} orientation={orientation} onLayoutChanged={persist}>
      {panels.map((panel, index) => (
        <PaneSlot
          key={panel.id}
          groupId={id}
          panel={panel}
          previous={panels[index - 1]}
          pixels={pixels}
          handle={handle}
          handleClassName={handleClassName}
          handleLabel={handleLabel}
        />
      ))}
    </ResizablePanelGroup>
  )
}
