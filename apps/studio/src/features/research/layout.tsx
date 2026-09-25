import type { ReactNode } from "react"
import { Heading, Surface, Text } from "@/components/studio"

export type Fact = { readonly id: string; readonly label: string; readonly value: ReactNode }

export type ResearchSectionProps = {
  readonly title: string
  readonly heading?: ReactNode
  readonly description?: ReactNode
  readonly trailing?: ReactNode
  readonly children: ReactNode
}

export function ResearchSection({ title, heading, description, trailing, children }: ResearchSectionProps) {
  return (
    <section aria-label={title} className="min-w-0">
      <Heading size="section" title={heading ?? title} description={description} trailing={trailing} />
      <div className="mt-2 flex min-w-0 flex-col gap-3">{children}</div>
    </section>
  )
}

export function FactList({ facts }: { readonly facts: readonly Fact[] }) {
  return (
    <Surface variant="panel" className="overflow-hidden">
      <dl className="divide-y divide-border">
        {facts.map((fact) => (
          <div key={fact.id} className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 px-3 py-2.25">
            <Text as="dt" role="hint" tone="neutral">
              {fact.label}
            </Text>
            <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
  )
}

export function Failure({ message }: { readonly message: string }) {
  return (
    <Text role="hint" tone="destructive" asChild>
      <p role="alert">{message}</p>
    </Text>
  )
}
