import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { hasContent } from "./rich"

export type PageWidth = "md" | "lg" | "xl"
export type PageAside = { readonly content: ReactNode; readonly width: number }

export type PageProps = {
  readonly width?: PageWidth
  readonly header?: ReactNode
  readonly beforeSticky?: ReactNode
  readonly sticky?: ReactNode
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

const pageWidthVariants = cva("mx-auto box-content px-4", {
  variants: {
    width: {
      md: "max-w-[1280px]",
      lg: "max-w-[1400px]",
      xl: "max-w-[1760px]",
    },
  },
  defaultVariants: { width: "md" },
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

export function Page({ width, header, beforeSticky, sticky, aside, below, children }: PageProps) {
  if (hasContent(sticky)) {
    return (
      <div data-scroll-restoration-id="page" className="h-full min-h-0 overflow-auto bg-background-subtle">
        {hasContent(header) ? <div className={`${pageWidthVariants({ width })} pt-3.5 pb-4`}>{header}</div> : null}
        {hasContent(beforeSticky) ? <div className={`${pageWidthVariants({ width })} pt-4`}>{beforeSticky}</div> : null}
        <div className="sticky top-0 z-20">{sticky}</div>
        <div className={`${pageWidthVariants({ width })} pt-4 pb-20`}>
          <PageBody aside={aside}>{children}</PageBody>
          {hasContent(below) ? <div className="mt-5.5">{below}</div> : null}
        </div>
      </div>
    )
  }
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
