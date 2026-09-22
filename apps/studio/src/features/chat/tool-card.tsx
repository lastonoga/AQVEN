import type { ToolCallMessagePartProps } from "@assistant-ui/react"
import { useTranslations } from "use-intl"
import { Surface, Toolbar } from "@/components/studio"
import { Button } from "@/components/ui/button"
import { toolSnapshot } from "./chat-events"
import { presentToolCall } from "./tool-card-model"
import { ToolCardFrame } from "./tool-card-frame"

export type ToolPartProps = ToolCallMessagePartProps<Record<string, unknown>>

type ApprovalProps = { readonly approval: NonNullable<ToolPartProps["approval"]>; readonly respond: ToolPartProps["respondToApproval"] }

function ApprovalBar({ approval, respond }: ApprovalProps) {
  const t = useTranslations("chat")
  const domain = useTranslations("domain")
  if (approval.approved !== undefined) return null
  const answer = (approved: boolean) => () => {
    void respond({ approved })
  }
  return (
    <Surface variant="footer" asChild>
      <Toolbar size="sm" wrap>
        <Button variant="outline" size="xs" onClick={answer(true)}>
          {domain("approvalDecision.allow")}
        </Button>
        <Button variant="outline-destructive" size="xs" onClick={answer(false)}>
          {domain("approvalDecision.deny")}
        </Button>
        <span className="text-muted-foreground">{approval.prompt ?? t("approval.prompt")}</span>
      </Toolbar>
    </Surface>
  )
}

export function ToolCard(part: ToolPartProps) {
  const t = useTranslations("chat")
  const snapshot = toolSnapshot(part.artifact) ?? { toolName: part.toolName, mcpServer: null, argsText: part.argsText, facet: null, status: null }
  const approval = part.approval
  const footer = approval === undefined ? null : <ApprovalBar approval={approval} respond={part.respondToApproval} />
  return <ToolCardFrame {...presentToolCall(snapshot, t)} footer={footer} />
}
