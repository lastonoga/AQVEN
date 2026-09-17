import { Link } from "@tanstack/react-router"
import { Play } from "lucide-react"
import { Dot, Heading, MetaLine, OUTCOME_TONE, Text } from "@/components/studio"
import { Button } from "@/components/ui/button"
import type { TestSummary } from "@/domain"
import { noop } from "@/lib/noop"
import { ROUTE_PATH, type WorkflowParams } from "@/lib/routes"
import type { Translator } from "@/i18n/translator"
import { presentScope } from "./presenters"

export type TestCellProps = { readonly test: TestSummary; readonly healthLabel: string; readonly t: Translator<"tests"> }
export type TestActionsProps = {
  readonly test: TestSummary
  readonly params: WorkflowParams
  readonly openLabel: string
  readonly runLabel: string
}

export function TestCell({ test, healthLabel, t }: TestCellProps) {
  const scope = presentScope(test.scope, t)
  return (
    <Heading
      size="item"
      titleAs="div"
      leading={<Dot tone={OUTCOME_TONE[test.health]} label={healthLabel} />}
      title={<MetaLine parts={scope.title} />}
      below={[
        <Text key="scope" as="div" role="meta" truncate>
          <MetaLine parts={scope.subtitle} />
        </Text>,
      ]}
    />
  )
}

export function TestActions({ test, params, openLabel, runLabel }: TestActionsProps) {
  return (
    <div className="flex justify-end gap-1.5">
      <Button variant="outline" size="sm" asChild>
        <Link to={ROUTE_PATH.testDetail} params={{ ...params, testId: test.id }}>
          {openLabel}
        </Link>
      </Button>
      <Button size="icon" aria-label={runLabel} onClick={noop}>
        <Play aria-hidden fill="currentColor" className="size-3" />
      </Button>
    </div>
  )
}
