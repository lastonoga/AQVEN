import type { ReactNode } from "react"

export type TimelineItem = { readonly id: string; readonly marker: ReactNode; readonly content: ReactNode }

export type TimelineEnd = { readonly marker: ReactNode; readonly content: ReactNode }

export type TimelineProps = { readonly items: readonly TimelineItem[]; readonly end?: TimelineEnd }

function TimelineStep({ item }: { readonly item: TimelineItem }) {
  return (
    <>
      <div className="col-start-1 flex flex-col items-center">
        {item.marker}
        <span aria-hidden className="w-[1.5px] flex-1 bg-border" />
      </div>
      <div id={item.id} className="col-start-2 min-w-0 scroll-mt-20 pb-6.5">
        {item.content}
      </div>
    </>
  )
}

function TimelineEndStep({ end }: { readonly end: TimelineEnd | undefined }) {
  if (end === undefined) return null
  return (
    <>
      <div className="col-start-1 flex justify-center">{end.marker}</div>
      <div className="col-start-2 min-w-0">{end.content}</div>
    </>
  )
}

export function Timeline({ items, end }: TimelineProps) {
  return (
    <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3">
      {items.map((item) => (
        <TimelineStep key={item.id} item={item} />
      ))}
      <TimelineEndStep end={end} />
    </div>
  )
}
