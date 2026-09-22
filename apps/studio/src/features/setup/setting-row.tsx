import type { ReactNode } from "react"
import { hasContent, Heading, Toolbar } from "@/components/studio"

export type SettingRowProps = {
  readonly title: ReactNode
  readonly hint?: ReactNode
  readonly detail?: ReactNode
  readonly children: ReactNode
}

export function SettingRow({ title, hint, detail, children }: SettingRowProps) {
  const below = [hint, detail].filter(hasContent)
  return (
    <Toolbar size="card" wrap end={children} className="justify-between">
      <Heading size="block" title={title} below={below} />
    </Toolbar>
  )
}

export function SettingRows({ children }: { readonly children: ReactNode }) {
  return <div className="divide-y divide-border">{children}</div>
}
