import type { Tone } from "@/components/studio"
import type { Whisker } from "./matrix-model"

export type CiWhiskerProps = {
  readonly whisker: Whisker | null
  readonly marks: readonly number[]
  readonly tone: Tone
  readonly label: string
}

const percent = (value: number): string => `${String(value)}%`

function WhiskerRange({ low, high }: { readonly low: number | null; readonly high: number | null }) {
  if (low === null || high === null) return null
  return (
    <>
      <span aria-hidden className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-tone" style={{ left: percent(low), width: percent(Math.max(high - low, 0)) }} />
      <span aria-hidden className="absolute inset-y-0.5 w-px bg-tone" style={{ left: percent(low) }} />
      <span aria-hidden className="absolute inset-y-0.5 w-px -translate-x-px bg-tone" style={{ left: percent(high) }} />
    </>
  )
}

export function CiWhisker({ whisker, marks, tone, label }: CiWhiskerProps) {
  return (
    <div role="img" aria-label={label} data-tone={tone} className="relative mt-1.5 h-3 w-full">
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
      {marks.map((mark) => (
        <span key={mark} aria-hidden className="absolute inset-y-0 w-0 border-l border-dashed border-muted-foreground" style={{ left: percent(mark) }} />
      ))}
      {whisker === null ? null : (
        <>
          <WhiskerRange low={whisker.low} high={whisker.high} />
          <span
            aria-hidden
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tone ring-2 ring-card"
            style={{ left: percent(whisker.point) }}
          />
        </>
      )}
    </div>
  )
}
