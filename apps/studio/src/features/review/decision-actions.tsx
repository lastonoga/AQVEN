import { useTranslations } from "use-intl"
import type { DecisionKind } from "@/domain"
import { Actions, Toolbar, type ActionSpec } from "@/components/studio"
import { decisionLabel } from "./presenters"

export type DecisionActionsProps = {
  readonly pending: boolean
  readonly onDecide: (decision: DecisionKind) => void
}

const DECISIONS: readonly DecisionKind[] = ["approve", "changes", "reject"]

const DECISION_VARIANT: Readonly<Record<DecisionKind, ActionSpec["variant"]>> = {
  approve: "default",
  changes: "outline",
  reject: "outline-destructive",
}

export function DecisionActions({ pending, onDecide }: DecisionActionsProps) {
  const t = useTranslations("review")
  const decisions = DECISIONS.map(
    (decision): ActionSpec => ({
      id: decision,
      label: decisionLabel(decision, t),
      variant: DECISION_VARIANT[decision],
      disabled: pending,
      onClick: () => {
        onDecide(decision)
      },
    }),
  )
  return (
    <Toolbar wrap aria-busy={pending} className="mt-2.5 gap-2">
      <Actions actions={[...decisions, { id: "reassign", label: t("decision.reassign") }]} />
    </Toolbar>
  )
}
