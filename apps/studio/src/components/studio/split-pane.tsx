import { Fragment, useRef, type ReactNode } from "react"
import { cn } from "cn"
import type { Layout, LayoutChangedMeta } from "react-resizable-panels"
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

const HANDLE_CLASS: Readonly<Record<SplitHandle, string>> = {
  ghost: "w-1.5 bg-transparent after:w-3 hover:bg-ring data-[separator=active]:bg-ring",
  line: "w-px bg-border after:w-1.5 hover:after:bg-ring data-[separator=active]:after:bg-ring",
  bar: "h-[5px] w-full bg-border hover:bg-ring data-[separator=active]:bg-ring",
}

const PIXEL_KEY_PREFIX = "split-pane"

const pixelKey = (groupId: string, panelId: string): string => [PIXEL_KEY_PREFIX, groupId, panelId].join(":")

const storedPixels = (groupId: string, panel: SplitPanel): number | undefined => {
  if (panel.fixed !== true) return undefined
  const raw = readViewerItem(pixelKey(groupId, panel.id))
  const value = Number(raw)
  return raw === null || !Number.isFinite(value) ? undefined : value
}

const resizeBehavior = (fixed: boolean | undefined) => (fixed === true ? "preserve-pixel-size" : "preserve-relative-size")

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
        <Fragment key={panel.id}>
          {index === 0 ? null : (
            <ResizableHandle aria-label={handleLabel} className={cn(HANDLE_CLASS[handle], handleClassName)} />
          )}
          <ResizablePanel
            id={panel.id}
            defaultSize={storedPixels(id, panel) ?? panel.defaultSize}
            minSize={panel.minSize}
            maxSize={panel.maxSize}
            groupResizeBehavior={resizeBehavior(panel.fixed)}
            className={panel.className}
            onResize={(size) => {
              pixels.current.set(panel.id, size.inPixels)
            }}
          >
            {panel.content}
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  )
}
