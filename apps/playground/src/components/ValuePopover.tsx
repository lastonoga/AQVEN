import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { CSSProperties, ReactNode } from "react"

type Spot = { left: number; edge: "top" | "bottom"; offset: number }

const WIDTH = 360
const GAP = 8
const MARGIN = 12
const MIN_BELOW = 220
const CLOSE_DELAY_MS = 140

const spotOf = (rect: DOMRect): Spot => {
  const left = Math.min(Math.max(MARGIN, rect.left), Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN))
  const below = window.innerHeight - rect.bottom - GAP - MARGIN
  if (below >= MIN_BELOW) return { left, edge: "top", offset: rect.bottom + GAP }
  return { left, edge: "bottom", offset: window.innerHeight - rect.top + GAP }
}

const styleOf = (spot: Spot): CSSProperties => ({
  left: spot.left,
  width: WIDTH,
  maxHeight: "60vh",
  [spot.edge]: spot.offset,
})

type Props = { content: ReactNode; children: ReactNode }

export function ValuePopover({ content, children }: Props) {
  const anchor = useRef<HTMLSpanElement>(null)
  const timer = useRef<number | null>(null)
  const [spot, setSpot] = useState<Spot | null>(null)

  const hold = (): void => {
    if (timer.current === null) return
    window.clearTimeout(timer.current)
    timer.current = null
  }

  const open = (): void => {
    hold()
    const rect = anchor.current?.getBoundingClientRect()
    if (rect === undefined) return
    setSpot(spotOf(rect))
  }

  const close = (): void => {
    hold()
    timer.current = window.setTimeout(() => setSpot(null), CLOSE_DELAY_MS)
  }

  useEffect(() => hold, [])

  useEffect(() => {
    if (spot === null) return
    const dismiss = (): void => setSpot(null)
    window.addEventListener("scroll", dismiss, true)
    window.addEventListener("resize", dismiss)
    return () => {
      window.removeEventListener("scroll", dismiss, true)
      window.removeEventListener("resize", dismiss)
    }
  }, [spot])

  if (content === null) return <>{children}</>

  return (
    <span
      ref={anchor}
      className="inline-flex max-w-full min-w-0"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {spot !== null &&
        createPortal(
          <div
            style={styleOf(spot)}
            onMouseEnter={hold}
            onMouseLeave={close}
            className="fixed z-50 overflow-auto rounded-md border border-slate-700 bg-slate-900 p-2.5 shadow-xl shadow-black/70"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  )
}
