import type { ReactNode } from "react"
import { Actions, type ActionSpec } from "./actions"

export type PageHeaderProps = {
  readonly actions: readonly ActionSpec[]
  readonly selector: ReactNode
  readonly aside?: ReactNode
  readonly detail?: ReactNode
}

export function PageHeader({ actions, selector, aside, detail }: PageHeaderProps) {
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <div className="flex shrink-0 gap-2"><Actions actions={actions} /></div>
        {selector}
        {aside === undefined ? null : <div className="min-w-0 max-w-72 xl:ml-auto">{aside}</div>}
      </div>
      {detail === undefined ? null : <div className="mt-4">{detail}</div>}
    </>
  )
}
