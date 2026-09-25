import type { ReactNode } from "react"
import { Surface, Text } from "@/components/studio"
import { Label } from "@/components/ui/label"
import type { FormProblem } from "./problems"
import { useProblemText } from "./view"

export function Problems({ problems }: { readonly problems: readonly FormProblem[] }) {
  const text = useProblemText()
  if (problems.length === 0) return null
  return (
    <ul className="flex min-w-0 flex-col gap-0.5">
      {problems.map((problem) => (
        <li key={`${problem.place}:${problem.code}`}>
          <Text role="hint" tone="destructive" className="wrap-anywhere">
            {text(problem)}
          </Text>
        </li>
      ))}
    </ul>
  )
}

export type FieldProps = {
  readonly id?: string
  readonly label: string
  readonly hint?: ReactNode
  readonly problems?: readonly FormProblem[]
  readonly children: ReactNode
}

export function Field({ id, label, hint, problems = [], children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {id === undefined ? (
        <Text role="label" tone="neutral">
          {label}
        </Text>
      ) : (
        <Text role="label" tone="neutral" asChild>
          <Label htmlFor={id}>{label}</Label>
        </Text>
      )}
      {children}
      {hint === undefined ? null : (
        <Text as="div" role="hint" tone="neutral" className="wrap-anywhere">
          {hint}
        </Text>
      )}
      <Problems problems={problems} />
    </div>
  )
}

export function Panel({ children }: { readonly children: ReactNode }) {
  return (
    <Surface variant="panel" padding="sm" className="flex min-w-0 flex-col gap-4">
      {children}
    </Surface>
  )
}
