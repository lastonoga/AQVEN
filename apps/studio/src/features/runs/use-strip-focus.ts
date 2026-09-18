import { useEffect, useRef, type RefObject } from "react"
import type { RunId } from "@/domain"

const CURRENT_CHIP = '[aria-current="true"]'
const INTO_VIEW: ScrollIntoViewOptions = { inline: "center", block: "nearest" }

const centre = (chip: Element | null | undefined): void => {
  if (chip === null || chip === undefined) return
  const scroll: unknown = Reflect.get(chip, "scrollIntoView")
  if (typeof scroll !== "function") return
  chip.scrollIntoView(INTO_VIEW)
}

export function useStripFocus(selected: RunId | null): RefObject<HTMLDivElement | null> {
  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (selected === null) return
    centre(strip.current?.querySelector(CURRENT_CHIP))
  }, [selected])
  return strip
}
