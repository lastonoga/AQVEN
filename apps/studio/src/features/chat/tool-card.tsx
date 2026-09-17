import type { ReactNode } from "react"
import type { ToolCallMessagePartProps } from "@assistant-ui/react"
import { Dot, Rich, Text } from "@/components/studio"
import { ToolCardFrame } from "./tool-card-frame"
import { presentToolCall, type ToolCallSnapshot, type ToolCardKind, type ToolCardModel } from "./tool-card-model"
import { useToolContext } from "./tool-context"
import type { ToolView } from "./tool-views"

export type ToolPartProps = ToolCallMessagePartProps<unknown>

type ToolCardRenderers = { readonly [K in ToolCardKind]: (model: ToolCardModel<K>) => ReactNode }

const RENDERERS: ToolCardRenderers = {
  hidden: () => null,
  progress: ({ label }) => (
    <Text as="div" role="meta" tone="neutral" className="flex items-center gap-2">
      <Dot tone="llm" pulse />
      <Rich value={label} />
    </Text>
  ),
  card: (model) => <ToolCardFrame {...model} />,
}

const renderModel = <K extends ToolCardKind>(model: ToolCardModel<K>): ReactNode => {
  const render: (model: ToolCardModel<K>) => ReactNode = RENDERERS[model.kind]
  return render(model)
}

const snapshotOf = (part: ToolPartProps): ToolCallSnapshot => ({
  toolName: part.toolName,
  args: part.args,
  result: part.result,
  artifact: part.artifact,
  isError: part.isError === true,
  statusType: part.status.type,
})

export function ToolCard<A, R, P>({ part, view }: { readonly part: ToolPartProps; readonly view: ToolView<A, R, P> }) {
  const ctx = useToolContext()
  return renderModel(presentToolCall(snapshotOf(part), view, ctx))
}
