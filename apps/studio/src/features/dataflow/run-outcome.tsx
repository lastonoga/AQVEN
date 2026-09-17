import { useTranslations } from "use-intl"
import type { RunOutcome } from "@/domain"
import { Surface, Text, Toolbar } from "@/components/studio"
import { outcomeView } from "./outcome"

export type RunOutcomeCardProps = { readonly outcome: RunOutcome }

function TraceGap({ line }: { readonly line: string | null }) {
  if (line === null) return null
  return (
    <Text role="small" tone="destructive" accent>
      {line}
    </Text>
  )
}

export function RunOutcomeCard({ outcome }: RunOutcomeCardProps) {
  const t = useTranslations("dataflow")
  const view = outcomeView(outcome, t)
  return (
    <Surface variant="panel" asChild>
      <Toolbar size="md" wrap end={<TraceGap line={view.traceGap} />}>
        <Text role="prose" tone="default">
          {view.title}
        </Text>
        <Text role="prose" tone="neutral">
          {view.note}{" "}
          <Text role="item" tone="default" weight="bold">
            {view.billed}
          </Text>
        </Text>
      </Toolbar>
    </Surface>
  )
}
