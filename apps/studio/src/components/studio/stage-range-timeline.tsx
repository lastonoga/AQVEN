import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import { GripVertical } from "lucide-react"
import { Slider } from "radix-ui"

type DragMode = "move" | "start" | "end"

export type StageStatus = {
  readonly canStart: boolean
  readonly compatible: boolean
  readonly unavailableReason?: string | null
}

export type StageRangeLabels = {
  readonly selectOnlyNode: (nodeId: string) => string
  readonly moveRange: string
  readonly moveRangeHint: string
  readonly startNode: string
  readonly endNode: string
}

export type StageRangeTimelineProps = {
  readonly order: readonly string[]
  readonly range: readonly [number, number]
  readonly onRangeChange: (next: readonly [number, number]) => void
  readonly stageStatus?: ((nodeId: string, currentEndNode: string | undefined) => StageStatus | null) | undefined
  readonly rangeAvailable?: boolean | null | undefined
  readonly labels: StageRangeLabels
  readonly testIdPrefix?: string
}

const shiftRange = (current: readonly [number, number], steps: number, count: number): readonly [number, number] => {
  const first = Math.max(0, Math.min(count - 1 - (current[1] - current[0]), current[0] + steps))
  return [first, first + current[1] - current[0]]
}

export function StageRangeTimeline({
  order,
  range,
  onRangeChange,
  stageStatus,
  rangeAvailable,
  labels,
  testIdPrefix = "stage-range",
}: StageRangeTimelineProps) {
  const trackRef = useRef<HTMLSpanElement | null>(null)
  const dragRef = useRef<{ pointerId: number; clientX: number; range: readonly [number, number]; mode: DragMode } | null>(null)

  if (order.length === 0) return null

  const moveRange = (next: number[]): void => {
    const nextStart = next[0]
    const nextEnd = next[1]
    if (nextStart === undefined || nextEnd === undefined) return
    onRangeChange([nextStart, nextEnd])
  }

  const moveEdge = (edge: "start" | "end", event: KeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    event.stopPropagation()
    if (edge === "start") onRangeChange([event.key === "Home" ? 0 : range[1], range[1]])
    else onRangeChange([range[0], event.key === "Home" ? range[0] : order.length - 1])
  }

  const beginDrag = (mode: DragMode, event: PointerEvent<HTMLElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus()
    dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, range, mode }
    if ("setPointerCapture" in event.currentTarget) event.currentTarget.setPointerCapture(event.pointerId)
  }

  const dragRange = (event: PointerEvent<HTMLElement>): void => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    const width = trackRef.current?.getBoundingClientRect().width ?? 0
    if (width <= 20 || order.length < 2) return
    const stepWidth = (width - 20) / (order.length - 1)
    const steps = Math.round((event.clientX - drag.clientX) / stepWidth)
    if (drag.mode === "move") {
      onRangeChange(shiftRange(drag.range, steps, order.length))
    } else if (drag.mode === "start") {
      onRangeChange([Math.max(0, Math.min(drag.range[1], drag.range[0] + steps)), drag.range[1]])
    } else {
      onRangeChange([drag.range[0], Math.max(drag.range[0], Math.min(order.length - 1, drag.range[1] + steps))])
    }
  }

  const endDrag = (event: PointerEvent<HTMLElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    dragRef.current = null
    if ("releasePointerCapture" in event.currentTarget) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const moveClipByKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()
    event.stopPropagation()
    const span = range[1] - range[0]
    if (event.key === "Home") onRangeChange([0, span])
    else if (event.key === "End") onRangeChange([order.length - 1 - span, order.length - 1])
    else onRangeChange(shiftRange(range, event.key === "ArrowLeft" ? -1 : 1, order.length))
  }

  const indexRatio = (index: number): number => order.length < 2 ? 0.5 : index / (order.length - 1)
  const startRatio = indexRatio(range[0])
  const endRatio = indexRatio(range[1])
  const clipHalfWidth = range[0] === range[1] ? 28 : 12
  const clipStyle = {
    left: `calc(${String(startRatio * 100)}% + ${String(10 - 20 * startRatio - clipHalfWidth)}px)`,
    width: `calc(${String((endRatio - startRatio) * 100)}% + ${String(-20 * (endRatio - startRatio) + clipHalfWidth * 2)}px)`,
  }
  const staggerLabels = order.length > 12
  const labelWidth = order.length < 2 ? 100 : Math.min(45, (staggerLabels ? 180 : 90) / (order.length - 1))

  const stageLabels = (above: boolean) => order.map((nodeId, index) => {
    if (above !== (staggerLabels && index % 2 === 0)) return null
    const status = stageStatus?.(nodeId, order[range[1]]) ?? null
    const inRange = index >= range[0] && index <= range[1]
    const selectedBoundary = index === range[0] || index === range[1]
    const edge = order.length < 2 ? null : index === 0 ? "first" : index === order.length - 1 ? "last" : null
    const tick = <span aria-hidden className={`block h-1.5 w-px shrink-0 ${inRange ? "bg-primary" : "bg-border"} ${edge === "first" ? "ml-2.5 self-start" : edge === "last" ? "mr-2.5 self-end" : "self-center"}`} />
    return (
      <button
        key={nodeId}
        type="button"
        aria-label={labels.selectOnlyNode(nodeId)}
        aria-pressed={range[0] === index && range[1] === index}
        onClick={() => { onRangeChange([index, index]) }}
        data-start-available={status === null ? "pending" : String(status.canStart)}
        data-current-end-compatible={status === null ? "pending" : String(status.compatible)}
        className={`absolute top-0 flex h-6 min-w-0 cursor-pointer flex-col items-center gap-1 overflow-hidden rounded-sm bg-transparent font-mono text-3xs leading-tight outline-none hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring ${edge === "first" ? "text-left" : edge === "last" ? "text-right" : "text-center"} ${selectedBoundary ? rangeAvailable === false ? "text-destructive" : "text-foreground" : status === null || status.canStart ? "text-muted-foreground" : "text-muted-foreground/40"}`}
        style={{
          left: `calc(${String(indexRatio(index) * 100)}% + ${String(10 - 20 * indexRatio(index))}px)`,
          width: `${String(edge === null ? labelWidth : Math.min(labelWidth, (staggerLabels ? 110 : 50) / (order.length - 1)))}%`,
          transform: edge === "first" ? "translateX(-10px)" : edge === "last" ? "translateX(calc(-100% + 10px))" : "translateX(-50%)",
        }}
        title={[nodeId, status?.canStart === false ? status.unavailableReason : null].filter(Boolean).join(" — ")}
      >
        {above ? <><span className="block w-full min-w-0 truncate">{nodeId}</span>{tick}</> : <>{tick}<span className="block w-full min-w-0 truncate">{nodeId}</span></>}
      </button>
    )
  })

  return (
    <div data-testid={`${testIdPrefix}-timeline`} className="min-w-0 px-5 pt-1">
      <div className="min-w-0">
        {staggerLabels ? <div className="relative h-6">{stageLabels(true)}</div> : null}
        <Slider.Root
          min={0}
          max={order.length - 1}
          step={1}
          minStepsBetweenThumbs={0}
          value={[range[0], range[1]]}
          onValueChange={moveRange}
          className="relative flex h-12 w-full touch-none items-center select-none [&>span:nth-last-child(-n+2)]:pointer-events-none"
        >
          <Slider.Track ref={trackRef} data-testid={`${testIdPrefix}-track`} className="relative h-8 w-full grow rounded-sm bg-muted">
            <Slider.Range className="absolute h-full rounded-sm bg-primary/20" />
          </Slider.Track>
          <button
            type="button"
            aria-label={labels.moveRange}
            aria-description={labels.moveRangeHint}
            title={labels.moveRangeHint}
            data-testid={`${testIdPrefix}-clip`}
            onPointerDown={(event) => { beginDrag("move", event) }}
            onPointerMove={dragRange}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={moveClipByKey}
            style={clipStyle}
            className="absolute top-2 flex h-8 touch-none items-center justify-center overflow-hidden rounded-sm border border-primary bg-primary/20 text-primary shadow-xs outline-none cursor-grab active:cursor-grabbing focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <GripVertical aria-hidden className={`size-3.5 shrink-0 ${range[0] === range[1] ? "-translate-x-5" : ""}`} />
          </button>
          <Slider.Thumb
            aria-label={labels.startNode}
            aria-valuetext={order[range[0]]}
            onKeyDown={(event) => { moveEdge("start", event) }}
            onPointerDown={(event) => { beginDrag("start", event) }}
            onPointerMove={dragRange}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ left: range[0] === range[1] ? "-18px" : undefined }}
            className="relative z-20 block h-9 w-5 touch-none rounded-sm border-2 border-primary bg-background shadow-xs outline-none pointer-events-auto cursor-ew-resize focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Slider.Thumb
            aria-label={labels.endNode}
            aria-valuetext={order[range[1]]}
            onKeyDown={(event) => { moveEdge("end", event) }}
            onPointerDown={(event) => { beginDrag("end", event) }}
            onPointerMove={dragRange}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            style={{ left: range[0] === range[1] ? "18px" : undefined }}
            className="relative z-20 block h-9 w-5 touch-none rounded-sm border-2 border-primary bg-background shadow-xs outline-none pointer-events-auto cursor-ew-resize focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Slider.Root>
        <div className="relative h-6">{stageLabels(false)}</div>
      </div>
    </div>
  )
}
