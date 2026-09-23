import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations } from "use-intl"
import { Dot, EXECUTION_STATUS_TONE, Text, type Tone } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { TraceRun } from "@/features/trace"
import { PresentationModeSwitch } from "./presentation-state"

type NavNode = {
  readonly id: string
  readonly anchor: string
  readonly name: string
  readonly status: string
  readonly tone: Tone
}

type RunNodeNavigatorProps = {
  readonly trace: TraceRun
  readonly focusedStage: string | null
  readonly onFocusStage: (stage: string | null) => void
  readonly stepAction?: (step: string) => ReactNode
}

const SCROLL_OFFSET = 64
const URL_UPDATE_DELAY = 120
const PROGRAMMATIC_SCROLL_PAUSE = 400

const scrollToNode = (node: NavNode): void => {
  document.getElementById(node.anchor)?.scrollIntoView({ block: "start", behavior: "auto" })
}

export function RunNodeNavigator({ trace, focusedStage, onFocusStage, stepAction }: RunNodeNavigatorProps) {
  const t = useTranslations("runs.navigation")
  const status = useTranslations("domain.executionStatus")
  const pending = useTranslations("runs.execution")("pending")
  const nodes: readonly NavNode[] = [
    ...trace.stages.map((stage) => ({
      id: stage.id,
      anchor: `stage-${stage.id}`,
      name: stage.nodeId,
      status: status(stage.status),
      tone: EXECUTION_STATUS_TONE[stage.status],
    })),
    ...trace.pending.map((nodeId) => ({
      id: `pending-${nodeId}`,
      anchor: `pending-${nodeId}`,
      name: nodeId,
      status: pending,
      tone: "neutral" as const,
    })),
  ]
  const nodesKey = nodes.map((node) => node.id).join("\u001f")
  const navRef = useRef<HTMLElement>(null)
  const nodesRef = useRef(nodes)
  const focusRef = useRef(onFocusStage)
  const activeRef = useRef<string | null>(focusedStage)
  const writtenRef = useRef<string | null | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressScrollRef = useRef(false)
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [active, setActive] = useState<string | null>(focusedStage)
  const [open, setOpen] = useState(false)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    nodesRef.current = nodes
    focusRef.current = onFocusStage
  })

  const showActive = (id: string | null): void => {
    activeRef.current = id
    setActive(id)
  }

  const saveActive = (id: string | null): void => {
    writtenRef.current = id
    focusRef.current(id)
  }

  const pauseScrollSync = (): void => {
    if (suppressTimerRef.current !== null) clearTimeout(suppressTimerRef.current)
    suppressScrollRef.current = true
    suppressTimerRef.current = setTimeout(() => {
      suppressScrollRef.current = false
      suppressTimerRef.current = null
    }, PROGRAMMATIC_SCROLL_PAUSE)
  }

  const jumpTo = (node: NavNode): void => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
    setOpen(false)
    showActive(node.id)
    saveActive(node.id)
    pauseScrollSync()
    scrollToNode(node)
  }

  useEffect(() => {
    if (writtenRef.current === focusedStage) {
      writtenRef.current = undefined
      return
    }
    if (focusedStage === null) {
      const frame = requestAnimationFrame(() => {
        activeRef.current = null
        setActive(null)
      })
      return () => { cancelAnimationFrame(frame) }
    }
    const node = nodesRef.current.find((item) => item.id === focusedStage)
    if (node === undefined) return
    const frame = requestAnimationFrame(() => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      activeRef.current = node.id
      setActive(node.id)
      pauseScrollSync()
      scrollToNode(node)
    })
    return () => { cancelAnimationFrame(frame) }
  }, [focusedStage, nodesKey])

  useEffect(() => {
    const scroller = navRef.current?.closest<HTMLElement>('[data-scroll-restoration-id="page"]')
    if (scroller === null || scroller === undefined) return
    let frame = 0
    const update = (): void => {
      frame = 0
      const scrollerTop = scroller.getBoundingClientRect().top
      const stickyTop = navRef.current?.parentElement?.getBoundingClientRect().top
      setStuck(stickyTop !== undefined && stickyTop <= scrollerTop + 1)
      if (suppressScrollRef.current) return
      const threshold = scrollerTop + (navRef.current?.offsetHeight ?? 0) + SCROLL_OFFSET
      let visible: string | null = null
      for (const node of nodesRef.current) {
        const element = document.getElementById(node.anchor)
        if (element === null) continue
        if (element.getBoundingClientRect().top > threshold) break
        visible = node.id
      }
      if (visible === activeRef.current) return
      activeRef.current = visible
      setActive(visible)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        saveActive(visible)
      }, URL_UPDATE_DELAY)
    }
    const onScroll = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      if (frame !== 0) cancelAnimationFrame(frame)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (suppressTimerRef.current !== null) clearTimeout(suppressTimerRef.current)
      suppressScrollRef.current = false
    }
  }, [nodesKey])

  if (nodes.length === 0) return null
  const index = nodes.findIndex((node) => node.id === active)
  const current = index < 0 ? null : nodes[index] ?? null
  const previous = index > 0 ? nodes[index - 1] ?? null : null
  const next = nodes[index + 1] ?? (index < 0 ? nodes[0] ?? null : null)

  return (
    <nav ref={navRef} aria-label={t("aria")} className={`flex min-w-0 items-center gap-2 px-4 py-2 ${stuck ? "border-b border-border bg-card" : "bg-transparent"}`}>
      <Text role="caption" weight="semibold" tone="neutral" className="shrink-0">{t("aria")}</Text>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" role="combobox" aria-label={t("select")} aria-expanded={open} className="min-w-0 max-w-72 flex-1 justify-start">
            {current === null ? <Text role="item" tone="neutral" truncate>{t("select")}</Text> : (
              <>
                <Dot tone={current.tone} />
                <Text role="item" weight="medium" truncate>{current.name}</Text>
              </>
            )}
            <ChevronDown aria-hidden className="ml-auto size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="dark w-80 max-w-[calc(100vw-2rem)] gap-0 p-1">
          <Command label={t("search")}>
            <CommandInput placeholder={t("search")} />
            <CommandList label={t("aria")}>
              <CommandEmpty>{t("noMatches")}</CommandEmpty>
              {nodes.map((node, position) => (
                <CommandItem key={node.id} value={`${String(position + 1)} ${node.name} ${node.status}`} data-checked={node.id === active} onSelect={() => { jumpTo(node) }}>
                  <Text role="tiny" tone="neutral" className="w-5 shrink-0 text-right tabular-nums">{position + 1}</Text>
                  <Dot tone={node.tone} />
                  <Text role="item" truncate>{node.name}</Text>
                  <Text role="tiny" tone="neutral" className="ml-auto shrink-0">{node.status}</Text>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Text role="tiny" tone="neutral" className="shrink-0 tabular-nums">{t("position", { current: Math.max(index + 1, 0), total: nodes.length })}</Text>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="outline" size="icon-sm" aria-label={t("previous")} disabled={previous === null} onClick={() => { if (previous !== null) jumpTo(previous) }}><ChevronLeft aria-hidden /></Button>
        <Button type="button" variant="outline" size="icon-sm" aria-label={t("next")} disabled={next === null} onClick={() => { if (next !== null) jumpTo(next) }}><ChevronRight aria-hidden /></Button>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {current === null || stepAction === undefined ? null : stepAction(current.name)}
        <PresentationModeSwitch />
      </div>
    </nav>
  )
}
