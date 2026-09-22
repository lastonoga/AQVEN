import type { ReactNode } from "react"
import { Heading } from "./heading"
import { Surface } from "./surface"

export type EmptyProps = { readonly title: ReactNode; readonly hint?: ReactNode }

export function Empty({ title, hint }: EmptyProps) {
  return (
    <Surface variant="well" padding="md">
      <Heading size="item" title={title} below={hint === undefined ? [] : [hint]} />
    </Surface>
  )
}
