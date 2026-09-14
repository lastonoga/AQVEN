import type { JSX } from "react"
import type { KindShape } from "./kinds.js"

const shapes: Record<KindShape, JSX.Element> = {
  square: <rect x="1" y="1" width="8" height="8" rx="1" />,
  circle: <circle cx="5" cy="5" r="4" />,
  diamond: <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" />,
  triangle: <path d="M1.6 0.8 9.2 5 1.6 9.2Z" />,
  hexagon: <path d="M5 0.6 9.2 3 9.2 7 5 9.4 0.8 7 0.8 3Z" />,
  bars: (
    <g>
      <rect x="0.8" y="1" width="8.4" height="2" rx="0.6" />
      <rect x="0.8" y="4" width="8.4" height="2" rx="0.6" />
      <rect x="0.8" y="7" width="8.4" height="2" rx="0.6" />
    </g>
  ),
  stack: (
    <g>
      <rect x="0.6" y="3" width="6" height="6" rx="1" />
      <rect x="3.4" y="1" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </g>
  ),
  ring: <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />,
  fanout: (
    <g fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M0.8 5H3.6M3.6 5 8.6 1.4M3.6 5 8.6 8.6M3.6 5H8.6" />
    </g>
  ),
  fanin: (
    <g fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M9.2 5H6.4M6.4 5 1.4 1.4M6.4 5 1.4 8.6M6.4 5H1.4" />
    </g>
  ),
}

type Props = { shape: KindShape; size?: number }

export function KindGlyph({ shape, size = 10 }: Props) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} fill="currentColor" aria-hidden="true">
      {shapes[shape]}
    </svg>
  )
}
