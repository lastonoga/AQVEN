import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { hasContent } from "./rich"

export type PageWidth = "md" | "lg" | "xl"
export type PageAside = { readonly content: ReactNode; readonly width: number }

export type PageProps = {
  readonly width?: PageWidth
  readonly header?: ReactNode
  readonly aside?: PageAside
  readonly below?: ReactNode
  readonly children: ReactNode
}

const pageInnerVariants = cva("mx-auto box-content px-4 pb-20", {
  variants: {
    width: {
      md: "max-w-[1280px] pt-4.5",
      lg: "max-w-[1400px] pt-4.5",
      xl: "max-w-[1760px] pt-3.5",
    },
  },
  defaultVariants: {
    width: "md",
  },
})

function PageBody({ aside, children }: { readonly aside: PageAside | undefined; readonly children: ReactNode }) {
  if (aside === undefined) return <>{children}</>
  return (
    <div className="grid items-start gap-3" style={{ gridTemplateColumns: `minmax(0,${String(aside.width)}px) minmax(0,1fr)` }}>
      {aside.content}
      {children}
    </div>
  )
}

export function Page({ width, header, aside, below, children }: PageProps) {
  return (
    <div data-scroll-restoration-id="page" className="h-full min-h-0 overflow-auto bg-background-subtle">
      <div className={pageInnerVariants({ width })}>
        {hasContent(header) ? <div className="mb-4">{header}</div> : null}
        <PageBody aside={aside}>{children}</PageBody>
        {hasContent(below) ? <div className="mt-5.5">{below}</div> : null}
      </div>
    </div>
  )
}
